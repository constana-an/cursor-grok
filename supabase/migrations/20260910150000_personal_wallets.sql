-- Personal wallets: each partner owns their own sweet-heart coin balance and
-- funds their own orders. Nobody can spend the other person's coins.
--
--   * the balance moves from couples.coin_balance to profiles.coin_balance
--   * both sides restart at the opening balance of 8
--   * task and check-in rewards credit the person who earned them
--   * an order debits the sender; declining it refunds the sender
--   * task rewards go back to their original single-earner values, because the
--     reason for halving them (two people feeding one wallet) is gone

-- 1. The wallet itself -----------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'coin_balance'
  ) then
    -- Adding the column with a default gives every existing member exactly the
    -- opening balance, which is the agreed split of the old shared wallet.
    alter table public.profiles
      add column coin_balance integer not null default 8 check (coin_balance >= 0);
  end if;
end
$$;

-- The shared wallet must not survive as a second source of truth.
alter table public.couples drop column if exists coin_balance;

-- Balances are only ever moved by the security-definer functions below.
revoke insert, update, delete on public.profiles from anon, authenticated;

-- 2. Original per-person reward values -------------------------------------

update public.task_catalog set reward = v.reward
from (values
  ('morning', 1), ('compliment', 2), ('mood', 2), ('focus', 3),
  ('photo', 5), ('walk-task', 6), ('order-task', 8), ('date-task', 10)
) as v(id, reward)
where public.task_catalog.id = v.id;

-- 3. Spending: the sender pays from their own wallet ------------------------

create or replace function public.place_couple_order(
  p_id uuid,
  p_item_id text,
  p_item_name text,
  p_image_url text,
  p_price integer,
  p_note text,
  p_desired_time text,
  p_from_name text,
  p_to_name text
)
returns table(order_id uuid, coin_balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
  v_balance integer;
  v_item public.menu_catalog%rowtype;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform public.assert_action_limit('place_order', 12, 10);
  select couple_id into v_couple_id from public.profiles where user_id = auth.uid();
  if v_couple_id is null then raise exception 'not paired'; end if;
  select * into v_item from public.menu_catalog where id = p_item_id and is_active;
  if v_item.id is null then raise exception 'invalid item'; end if;
  if char_length(coalesce(p_note, '')) > 160 or char_length(coalesce(p_desired_time, '')) > 40 then raise exception 'invalid order details'; end if;
  if char_length(trim(coalesce(p_from_name, ''))) not between 1 and 20 or char_length(trim(coalesce(p_to_name, ''))) not between 1 and 20 then raise exception 'invalid names'; end if;
  if v_item.is_limited and exists (
    select 1 from public.orders where couple_id = v_couple_id and item_id = v_item.id and status <> 'rejected'
  ) then raise exception 'limited item already used'; end if;

  update public.profiles
  set coin_balance = profiles.coin_balance - v_item.price
  where user_id = auth.uid() and profiles.coin_balance >= v_item.price
  returning profiles.coin_balance into v_balance;
  if v_balance is null then raise exception 'insufficient balance'; end if;

  insert into public.orders(id, couple_id, created_by, item_id, item_name, image_url, price, note, desired_time, status, from_name, to_name)
  values (p_id, v_couple_id, auth.uid(), v_item.id, v_item.name, v_item.image_url, v_item.price, trim(coalesce(p_note, '')), p_desired_time, 'pending', trim(p_from_name), trim(p_to_name));
  perform public.write_audit(v_couple_id, 'order.created', jsonb_build_object('order_id', p_id, 'item_id', v_item.id, 'price', v_item.price));
  return query select p_id, v_balance;
end;
$$;

-- 4. Earning: rewards credit the person who earned them ---------------------

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
  v_period_key text;
  v_balance integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform public.assert_action_limit('claim_task', 16, 10);
  select couple_id into v_couple_id from public.profiles where user_id = auth.uid();
  if v_couple_id is null then raise exception 'not paired'; end if;
  select frequency, reward into v_frequency, v_reward from public.task_catalog where id = p_task_id;
  if v_reward is null then raise exception 'invalid task'; end if;
  v_period_key := case when v_frequency = 'daily' then public.app_today()::text else public.app_week_start()::text end;
  insert into public.task_claims(couple_id, user_id, task_id, period_key, reward)
  values (v_couple_id, auth.uid(), p_task_id, v_period_key, v_reward);
  update public.profiles set coin_balance = profiles.coin_balance + v_reward
  where user_id = auth.uid()
  returning profiles.coin_balance into v_balance;
  perform public.write_audit(v_couple_id, 'task.claimed', jsonb_build_object('task_id', p_task_id, 'reward', v_reward, 'period', v_period_key));
  return query select v_balance, v_period_key;
end;
$$;

create or replace function public.daily_checkin()
returns table(coin_balance integer, streak integer, checked_on date, reward integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
  v_balance integer;
  v_today date := public.app_today();
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform public.assert_action_limit('daily_checkin', 4, 60);
  select couple_id into v_couple_id from public.profiles where user_id = auth.uid();
  if v_couple_id is null then raise exception 'not paired'; end if;
  insert into public.daily_checkins(couple_id, user_id, checked_on, reward) values (v_couple_id, auth.uid(), v_today, 1);
  update public.profiles set coin_balance = profiles.coin_balance + 1
  where user_id = auth.uid()
  returning profiles.coin_balance into v_balance;
  perform public.write_audit(v_couple_id, 'checkin.created', jsonb_build_object('reward', 1));
  return query select v_balance, public.checkin_streak(auth.uid()), v_today, 1;
end;
$$;

-- 5. Declining an order refunds the sender, not the responder ---------------

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

  update public.orders set status = p_status where id = p_order_id;

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

grant execute on function public.place_couple_order(uuid, text, text, text, integer, text, text, text, text) to authenticated;
grant execute on function public.claim_couple_task(text) to authenticated;
grant execute on function public.daily_checkin() to authenticated;
grant execute on function public.update_order_status(uuid, text) to authenticated;
