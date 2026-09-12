-- Hardening pass:
--   1. Anchor every reward period to one shop timezone instead of UTC.
--   2. Refund the sender when an order is declined.
--   3. Only the recipient may accept, decline, progress or finish an order.
--   4. Close the direct-table write path that bypassed the order state machine.
--   5. Index every couple_id lookup.
--   6. Give the operational tables a retention policy.
--   7. Halve per-person task rewards now that both partners claim their own.

-- 1. Shop timezone -------------------------------------------------------

create or replace function public.app_time_zone()
returns text language sql immutable as $$ select 'Asia/Shanghai'::text $$;

create or replace function public.app_today()
returns date language sql stable as $$
  select (now() at time zone public.app_time_zone())::date
$$;

create or replace function public.app_week_start()
returns date language sql stable as $$
  select (date_trunc('week', public.app_today()))::date
$$;

grant execute on function public.app_time_zone(), public.app_today(), public.app_week_start() to authenticated;

-- 7. Per-person rewards, halved so the couple's ceiling is unchanged ------

update public.task_catalog set reward = v.reward
from (values
  ('morning', 1), ('compliment', 1), ('mood', 1), ('focus', 1),
  ('photo', 2), ('walk-task', 3), ('order-task', 4), ('date-task', 5)
) as v(id, reward)
where public.task_catalog.id = v.id;

-- 5. Indexes -------------------------------------------------------------

create index if not exists orders_couple_created_idx on public.orders (couple_id, created_at desc);
create index if not exists orders_couple_item_idx on public.orders (couple_id, item_id);
create index if not exists profiles_couple_idx on public.profiles (couple_id);
create index if not exists task_claims_couple_user_idx on public.task_claims (couple_id, user_id);
create index if not exists memory_entries_couple_idx on public.memory_entries (couple_id, happened_on desc);
create index if not exists anniversaries_couple_idx on public.anniversaries (couple_id, event_date);
create index if not exists daily_checkins_user_day_idx on public.daily_checkins (user_id, checked_on desc);
create index if not exists daily_checkins_couple_idx on public.daily_checkins (couple_id);
create index if not exists audit_logs_couple_created_idx on public.audit_logs (couple_id, created_at desc);
create index if not exists push_subscriptions_couple_idx on public.push_subscriptions (couple_id);
create index if not exists app_errors_created_idx on public.app_errors (created_at desc);

-- 6. Retention -----------------------------------------------------------

create or replace function public.prune_operational_data(p_audit_days integer default 180)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limits integer;
  v_audit integer;
  v_errors integer;
begin
  delete from public.action_rate_limits where window_started_at < now() - interval '2 days';
  get diagnostics v_limits = row_count;
  delete from public.audit_logs where created_at < now() - make_interval(days => greatest(p_audit_days, 30));
  get diagnostics v_audit = row_count;
  delete from public.app_errors where created_at < now() - interval '30 days';
  get diagnostics v_errors = row_count;
  return jsonb_build_object('rate_limits', v_limits, 'audit_logs', v_audit, 'app_errors', v_errors);
end;
$$;

revoke execute on function public.prune_operational_data(integer) from public, anon, authenticated;

-- Free projects may not have pg_cron; keep the nightly job optional.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('couple-shop-prune');
    exception when others then null;
    end;
    perform cron.schedule('couple-shop-prune', '17 4 * * *', 'select public.prune_operational_data();');
  end if;
end
$$;

-- Rate-limit rows are also swept per caller so the table stays small even
-- without pg_cron.
create or replace function public.assert_action_limit(p_action text, p_max_hits integer, p_window_minutes integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_max_hits < 1 or p_window_minutes < 1 then raise exception 'invalid rate limit'; end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / (p_window_minutes * 60)) * (p_window_minutes * 60));
  delete from public.action_rate_limits
  where user_id = auth.uid() and window_started_at < now() - interval '1 day';
  insert into public.action_rate_limits(user_id, action, window_started_at, hits)
  values (auth.uid(), p_action, v_window, 1)
  on conflict (user_id, action, window_started_at)
  do update set hits = action_rate_limits.hits + 1
  returning hits into v_hits;
  if v_hits > p_max_hits then raise exception 'rate limit exceeded'; end if;
end;
$$;

-- 1 + 7. Task claims now use the shop-timezone period key -----------------

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
  update public.couples set coin_balance = couples.coin_balance + v_reward where id = v_couple_id returning couples.coin_balance into v_balance;
  perform public.write_audit(v_couple_id, 'task.claimed', jsonb_build_object('task_id', p_task_id, 'reward', v_reward, 'period', v_period_key));
  return query select v_balance, v_period_key;
end;
$$;

-- 1. Check-ins: shop-timezone day, and a streak that survives "not yet
-- checked in today" instead of reporting 0 every morning.

create or replace function public.checkin_streak(p_user_id uuid)
returns integer
language sql
stable
set search_path = public
as $$
  with anchor as (
    select case
      when exists (select 1 from public.daily_checkins where user_id = p_user_id and checked_on = public.app_today())
      then public.app_today()
      else public.app_today() - 1
    end as day
  ),
  run as (
    select c.checked_on, row_number() over (order by c.checked_on desc) as rn
    from public.daily_checkins c, anchor a
    where c.user_id = p_user_id and c.checked_on <= a.day
  )
  select coalesce(count(*)::integer, 0)
  from run, anchor a
  where run.checked_on = a.day - (run.rn - 1)::integer;
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
  update public.couples set coin_balance = couples.coin_balance + 1 where id = v_couple_id returning couples.coin_balance into v_balance;
  perform public.write_audit(v_couple_id, 'checkin.created', jsonb_build_object('reward', 1));
  return query select v_balance, public.checkin_streak(auth.uid()), v_today, 1;
end;
$$;

create or replace function public.get_checkin_status()
returns table(streak integer, checked_today boolean)
language sql
security definer
set search_path = public
as $$
  select
    public.checkin_streak(auth.uid()),
    exists (select 1 from public.daily_checkins where user_id = auth.uid() and checked_on = public.app_today());
$$;

-- 2 + 3. Order responses: recipient only, with a refund on decline --------

-- The return type changes from `text` to a row, so the old function must go first.
drop function if exists public.update_order_status(uuid, text);

create function public.update_order_status(p_order_id uuid, p_status text)
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
    update public.couples set coin_balance = couples.coin_balance + v_order.price
    where id = v_order.couple_id
    returning couples.coin_balance into v_balance;
    perform public.write_audit(v_order.couple_id, 'order.refunded', jsonb_build_object('order_id', p_order_id, 'price', v_order.price));
  else
    select couples.coin_balance into v_balance from public.couples where id = v_order.couple_id;
  end if;

  perform public.write_audit(v_order.couple_id, 'order.status_changed', jsonb_build_object('order_id', p_order_id, 'from', v_order.status, 'to', p_status));
  return query select p_status, v_balance;
end;
$$;

-- 4. Orders are read-only to clients; every write goes through the RPCs ---

drop policy if exists "create couple orders" on public.orders;
drop policy if exists "update couple orders" on public.orders;
revoke insert, update, delete on public.orders from anon, authenticated;
revoke insert, update, delete on public.couples from anon, authenticated;
revoke insert, update, delete on public.task_claims from anon, authenticated;
revoke insert, update, delete on public.daily_checkins from anon, authenticated;

-- A future-dated start date must be judged in the shop timezone too.
create or replace function public.update_couple_profile(
  p_name text,
  p_partner_a_name text,
  p_partner_b_name text,
  p_started_on date
)
returns table(
  couple_id uuid,
  name text,
  partner_a_name text,
  partner_b_name text,
  started_on date,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if trim(coalesce(p_name, '')) = '' or char_length(trim(p_name)) > 20 then raise exception 'invalid shop name'; end if;
  if trim(coalesce(p_partner_a_name, '')) = '' or char_length(trim(p_partner_a_name)) > 20 then raise exception 'invalid first name'; end if;
  if trim(coalesce(p_partner_b_name, '')) = '' or char_length(trim(p_partner_b_name)) > 20 then raise exception 'invalid second name'; end if;
  if p_started_on is null or p_started_on > public.app_today() then raise exception 'invalid started date'; end if;

  select profiles.couple_id into v_couple_id from public.profiles where user_id = auth.uid();
  if v_couple_id is null then raise exception 'not paired'; end if;

  return query
  update public.couples
  set name = trim(p_name),
      partner_a_name = trim(p_partner_a_name),
      partner_b_name = trim(p_partner_b_name),
      started_on = p_started_on,
      updated_at = now()
  where id = v_couple_id
  returning id, couples.name, couples.partner_a_name, couples.partner_b_name, couples.started_on, couples.updated_at;
end;
$$;

grant execute on function public.checkin_streak(uuid) to authenticated;
grant execute on function public.update_order_status(uuid, text) to authenticated;
grant execute on function public.get_checkin_status() to authenticated;
grant execute on function public.daily_checkin() to authenticated;
grant execute on function public.claim_couple_task(text) to authenticated;
grant execute on function public.update_couple_profile(text, text, text, date) to authenticated;
