-- Two people, one shop — but until now each phone could only see itself.
--
-- Both partners check in, claim tasks and save coins in complete isolation; the
-- only place their two halves ever met was an order. This adds the narrowest
-- possible window across that boundary.
--
-- The window is a function, not a wider policy, and that is the whole point.
-- `profiles` deliberately only lets a person read their own row, because
-- `coin_balance` lives there and wallets are private. Relaxing that policy to
-- show a streak would leak the balance too. So instead: a security-definer
-- function that returns four fields and no balance, ever.

-- `earned_this_week` is the sum of task rewards, which is exactly the number
-- each person already sees about themselves on the tasks screen. It is not the
-- balance and cannot be used to derive one: a wallet is earnings minus spending
-- plus refunds, and none of that is exposed here.
create or replace function public.get_partner_status()
returns table(display_name text, streak integer, earned_this_week integer, checked_today boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
  v_partner uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select couple_id into v_couple_id from public.profiles where user_id = auth.uid();
  -- Not paired yet: no partner, no row. The client renders nothing.
  if v_couple_id is null then return; end if;

  select user_id into v_partner
  from public.profiles
  where couple_id = v_couple_id and user_id <> auth.uid()
  limit 1;
  if v_partner is null then return; end if;

  return query
  select
    p.display_name,
    public.checkin_streak(v_partner),
    -- Daily keys are the day itself and weekly keys are the Monday, so one
    -- lexicographic bound over ISO dates catches both kinds for this week.
    (select coalesce(sum(tc.reward), 0)::integer from public.task_claims tc
      where tc.user_id = v_partner and tc.period_key >= public.app_week_start()::text),
    exists (select 1 from public.daily_checkins dc
      where dc.user_id = v_partner and dc.checked_on = public.app_today())
  from public.profiles p
  where p.user_id = v_partner;
end;
$$;

grant execute on function public.get_partner_status() to authenticated;

-- Realtime for the tables that now drive a live view --------------------------
--
-- `custom_menu_items` has been subscribed to by the client since custom wishes
-- shipped, but the table was never added to the publication, so that handler
-- has never once fired — a wish written on one phone only appeared on the other
-- after a reload. The two claim tables are new subscriptions for the partner
-- card. RLS still decides what each subscriber is allowed to receive.

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'custom_menu_items') then
    alter publication supabase_realtime add table public.custom_menu_items;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_claims') then
    alter publication supabase_realtime add table public.task_claims;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'daily_checkins') then
    alter publication supabase_realtime add table public.daily_checkins;
  end if;
end
$$;

-- A cap on how many wishes a couple can write ----------------------------------
--
-- `custom_menu_items` constrains every field of a single row — name length,
-- description length, price range — but nothing has ever constrained the number
-- of rows. A shop with 200 self-written wishes is a shop nobody can scroll.

create or replace function public.enforce_custom_wish_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.custom_menu_items where couple_id = new.couple_id) >= 30 then
    raise exception 'custom wish limit reached';
  end if;
  return new;
end;
$$;

drop trigger if exists custom_wish_cap on public.custom_menu_items;
create trigger custom_wish_cap
  before insert on public.custom_menu_items
  for each row execute function public.enforce_custom_wish_cap();
