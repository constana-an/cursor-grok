create extension if not exists pgcrypto;

create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique,
  name text not null default '我们的小铺',
  created_at timestamptz not null default now()
);

alter table public.couples add column if not exists coin_balance integer not null default 8 check (coin_balance >= 0);
alter table public.couples add column if not exists partner_a_name text not null default '大宝';
alter table public.couples add column if not exists partner_b_name text not null default '二宝';
alter table public.couples add column if not exists started_on date not null default current_date;
alter table public.couples add column if not exists updated_at timestamptz not null default now();

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  item_name text not null,
  image_url text,
  price integer not null check (price >= 0),
  note text,
  desired_time text not null,
  status text not null default 'pending' check (status in ('pending','accepted','doing','done','rejected')),
  from_name text not null,
  to_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.task_catalog (
  id text primary key,
  frequency text not null check (frequency in ('daily','weekly')),
  reward integer not null check (reward > 0)
);

insert into public.task_catalog(id, frequency, reward) values
  ('morning','daily',1), ('compliment','daily',2), ('mood','daily',2), ('focus','daily',3),
  ('photo','weekly',5), ('walk-task','weekly',6), ('order-task','weekly',8), ('date-task','weekly',10)
on conflict (id) do update set frequency = excluded.frequency, reward = excluded.reward;

create table if not exists public.task_claims (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null references public.task_catalog(id),
  period_key text not null,
  reward integer not null,
  created_at timestamptz not null default now(),
  unique(user_id, task_id, period_key)
);

alter table public.couples enable row level security;
alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.task_catalog enable row level security;
alter table public.task_claims enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (user_id = auth.uid());
drop policy if exists "read own couple" on public.couples;
create policy "read own couple" on public.couples for select using (
  exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.couple_id = couples.id)
);
drop policy if exists "read couple orders" on public.orders;
create policy "read couple orders" on public.orders for select using (
  exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.couple_id = orders.couple_id)
);
drop policy if exists "create couple orders" on public.orders;
create policy "create couple orders" on public.orders for insert with check (
  created_by = auth.uid() and exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.couple_id = orders.couple_id)
);
drop policy if exists "update couple orders" on public.orders;
create policy "update couple orders" on public.orders for update using (
  exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.couple_id = orders.couple_id)
);
drop policy if exists "manage own push subscription" on public.push_subscriptions;
create policy "manage own push subscription" on public.push_subscriptions for all using (user_id = auth.uid()) with check (
  user_id = auth.uid() and exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.couple_id = push_subscriptions.couple_id)
);
drop policy if exists "read task catalog" on public.task_catalog;
create policy "read task catalog" on public.task_catalog for select using (true);
drop policy if exists "read couple task claims" on public.task_claims;
create policy "read couple task claims" on public.task_claims for select using (
  exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.couple_id = task_claims.couple_id)
);

create or replace function public.create_couple_space(display_name text)
returns table(couple_id uuid, invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
  v_invite_code text;
begin
  loop
    v_invite_code := lpad((floor(random() * 900000) + 100000)::text, 6, '0');
    begin
      insert into public.couples(invite_code) values (v_invite_code) returning id into v_couple_id;
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;
  insert into public.profiles(user_id, couple_id, display_name)
  values (auth.uid(), v_couple_id, display_name)
  on conflict (user_id) do update set couple_id = excluded.couple_id, display_name = excluded.display_name;
  return query select v_couple_id, v_invite_code;
end;
$$;

create or replace function public.join_couple_space(code text, display_name text)
returns table(couple_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
begin
  select id into v_couple_id from public.couples where invite_code = code;
  if v_couple_id is null then raise exception 'invalid invite code'; end if;
  insert into public.profiles(user_id, couple_id, display_name)
  values (auth.uid(), v_couple_id, display_name)
  on conflict (user_id) do update set couple_id = excluded.couple_id, display_name = excluded.display_name;
  return query select v_couple_id;
end;
$$;

grant execute on function public.create_couple_space(text) to authenticated;
grant execute on function public.join_couple_space(text, text) to authenticated;

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
  if p_started_on is null or p_started_on > current_date then raise exception 'invalid started date'; end if;

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

grant execute on function public.update_couple_profile(text, text, text, date) to authenticated;

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
  select couple_id into v_couple_id from public.profiles where user_id = auth.uid();
  if v_couple_id is null then raise exception 'not paired'; end if;
  select frequency, reward into v_frequency, v_reward from public.task_catalog where id = p_task_id;
  if v_reward is null then raise exception 'invalid task'; end if;
  v_period_key := case when v_frequency = 'daily' then current_date::text else date_trunc('week', current_date)::date::text end;
  insert into public.task_claims(couple_id, user_id, task_id, period_key, reward)
  values (v_couple_id, auth.uid(), p_task_id, v_period_key, v_reward);
  update public.couples set coin_balance = couples.coin_balance + v_reward where id = v_couple_id returning couples.coin_balance into v_balance;
  return query select v_balance, v_period_key;
end;
$$;

grant execute on function public.claim_couple_task(text) to authenticated;

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
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_price is null or p_price < 0 then raise exception 'invalid price'; end if;

  select couple_id into v_couple_id
  from public.profiles
  where user_id = auth.uid();
  if v_couple_id is null then raise exception 'not paired'; end if;

  update public.couples
  set coin_balance = couples.coin_balance - p_price
  where id = v_couple_id and couples.coin_balance >= p_price
  returning couples.coin_balance into v_balance;
  if v_balance is null then raise exception 'insufficient balance'; end if;

  insert into public.orders(
    id, couple_id, created_by, item_id, item_name, image_url, price,
    note, desired_time, status, from_name, to_name
  ) values (
    p_id, v_couple_id, auth.uid(), p_item_id, p_item_name, p_image_url, p_price,
    p_note, p_desired_time, 'pending', p_from_name, p_to_name
  );

  return query select p_id, v_balance;
end;
$$;

grant execute on function public.place_couple_order(uuid, text, text, text, integer, text, text, text, text) to authenticated;

-- A hosted Supabase project takes new tables into `supabase_realtime` on its
-- own, so an unguarded add fails with "already member of publication" and stops
-- the very first migration halfway through. The local stack does not do this,
-- which is why it only ever showed up against the real project.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'couples'
  ) then
    alter publication supabase_realtime add table public.couples;
  end if;
end
$$;

-- Run the migrations in order after this file:
--   migrations/20260910013000_place_couple_order.sql
--   migrations/20260910030000_couple_profile.sql
--   migrations/20260910060000_commercial_foundation.sql   -- accounts, security, memories, check-ins, membership
--   migrations/20260910120000_timezone_refund_and_retention.sql
--     -- shop-timezone period keys, decline refunds, recipient-only order
--     -- responses, RPC-only order writes, indexes and retention.
-- The later migrations replace several functions defined above; this file on
-- its own is not a complete deployment.
