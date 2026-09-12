-- Three of the eight tasks describe something the shop can actually see:
-- "记录一张本周合照", "认真完成一份订单" and "完成一次用心约会". Until now all
-- eight were pure honour system — the button paid out whether or not the thing
-- happened, which is the one place in the app where saying and doing can drift
-- apart. The other five (早安晚安、夸奖、分享心情、专心陪伴、一起散步) stay
-- manual on purpose: nothing in the data can witness them, and a checkbox that
-- lies is better than a requirement that cannot be satisfied honestly.
--
-- Verification runs server-side because the claim credits a wallet. The client
-- shows the same rule so the button explains itself instead of just failing.

-- 1. Orders learn when they were finished -------------------------------
--
-- `created_at` was standing in for a completion time everywhere. A wish ordered
-- last month and finished today belongs to this week's task and to this month's
-- "小小幸福" count, not to the month it was ordered in.

alter table public.orders add column if not exists completed_at timestamptz;
update public.orders set completed_at = created_at where status = 'done' and completed_at is null;
create index if not exists orders_completed_at_idx on public.orders(couple_id, completed_at) where status = 'done';

create or replace function public.update_order_status(p_order_id uuid, p_status text)
returns table(order_status text, coin_balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_balance integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_status not in ('accepted','doing','done','rejected') then raise exception 'invalid status'; end if;
  perform public.assert_action_limit('update_order', 30, 10);

  select o.* into v_order
  from public.orders o
  join public.profiles p on p.couple_id = o.couple_id
  where o.id = p_order_id and p.user_id = auth.uid();
  if v_order.id is null then raise exception 'order not found'; end if;

  -- The sender may not answer their own order.
  if v_order.created_by = auth.uid() then raise exception 'not the recipient'; end if;

  if not (
    (v_order.status = 'pending' and p_status in ('accepted','rejected'))
    or (v_order.status = 'accepted' and p_status = 'doing')
    or (v_order.status = 'doing' and p_status = 'done')
  ) then
    raise exception 'invalid transition';
  end if;

  update public.orders
  set status = p_status,
      completed_at = case when p_status = 'done' then now() else completed_at end
  where id = p_order_id;

  if p_status = 'rejected' then
    -- The refund goes back to whoever paid. If they have already left the
    -- couple their profile is gone and there is nothing to refund.
    update public.profiles set coin_balance = profiles.coin_balance + v_order.price
    where user_id = v_order.created_by;
    perform public.write_audit(v_order.couple_id, 'order.refunded', jsonb_build_object('order_id', p_order_id, 'price', v_order.price, 'refunded_to', v_order.created_by));
  end if;

  -- Always report the caller's own balance; the responder never pays.
  select profiles.coin_balance into v_balance from public.profiles where user_id = auth.uid();

  perform public.write_audit(v_order.couple_id, 'order.status_changed', jsonb_build_object('order_id', p_order_id, 'from', v_order.status, 'to', p_status));
  return query select p_status, v_balance;
end;
$$;

-- 2. The catalog records what each task needs to have happened ------------

alter table public.task_catalog add column if not exists requires text;
alter table public.task_catalog drop constraint if exists task_catalog_requires_check;
alter table public.task_catalog add constraint task_catalog_requires_check
  check (requires is null or requires in ('photo','order-done','date-done'));

update public.task_catalog set requires = null;
update public.task_catalog set requires = 'photo' where id = 'photo';
update public.task_catalog set requires = 'order-done' where id = 'order-task';
update public.task_catalog set requires = 'date-done' where id = 'date-task';

-- 3. The claim checks it -------------------------------------------------

create or replace function public.claim_couple_task(p_task_id text)
returns table(coin_balance integer, claim_key text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
  v_frequency text;
  v_reward integer;
  v_requires text;
  v_period_key text;
  v_period_start date;
  v_balance integer;
  v_met boolean;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform public.assert_action_limit('claim_task', 16, 10);
  select couple_id into v_couple_id from public.profiles where user_id = auth.uid();
  if v_couple_id is null then raise exception 'not paired'; end if;
  select frequency, reward, requires into v_frequency, v_reward, v_requires from public.task_catalog where id = p_task_id;
  if v_reward is null then raise exception 'invalid task'; end if;

  v_period_start := case when v_frequency = 'daily' then public.app_today() else public.app_week_start() end;
  v_period_key := v_period_start::text;

  if v_requires = 'photo' then
    -- The uploader earns it: both partners can each add their own photo.
    v_met := exists (
      select 1 from public.memory_entries m
      where m.couple_id = v_couple_id
        and m.created_by = auth.uid()
        and (m.created_at at time zone public.app_time_zone())::date >= v_period_start
    );
  elsif v_requires in ('order-done','date-done') then
    -- The person who *did* the thing earns it, which is the recipient of the
    -- order — never the one who ordered it.
    v_met := exists (
      select 1 from public.orders o
      join public.menu_catalog c on c.id = o.item_id
      where o.couple_id = v_couple_id
        and o.status = 'done'
        and o.created_by <> auth.uid()
        and (coalesce(o.completed_at, o.created_at) at time zone public.app_time_zone())::date >= v_period_start
        and (v_requires = 'order-done' or c.category = 'date')
    );
  else
    v_met := true;
  end if;
  if not v_met then raise exception 'requirement not met: %', v_requires; end if;

  insert into public.task_claims(couple_id, user_id, task_id, period_key, reward)
  values (v_couple_id, auth.uid(), p_task_id, v_period_key, v_reward);
  update public.profiles set coin_balance = profiles.coin_balance + v_reward
  where user_id = auth.uid()
  returning profiles.coin_balance into v_balance;
  perform public.write_audit(v_couple_id, 'task.claimed', jsonb_build_object('task_id', p_task_id, 'reward', v_reward, 'period', v_period_key));
  return query select v_balance, v_period_key;
end;
$$;

grant execute on function public.update_order_status(uuid, text) to authenticated;
grant execute on function public.claim_couple_task(text) to authenticated;
