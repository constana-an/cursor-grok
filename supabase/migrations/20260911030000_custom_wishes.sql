-- Couples can write their own wishes onto the menu.
--
-- The fixed 34 are what the shop opens with; after a few months they are the
-- reason the shop gets boring. A custom wish belongs to the couple, not to
-- whoever typed it, so either partner can edit or retire it — same reasoning as
-- the shared anniversaries.
--
-- Two deliberate limits: the price is clamped server-side (the client never
-- gets to name the price of an order), and custom wishes cannot be 限定券 —
-- the once-per-couple coupons are a fixed, curated set, and a self-issued
-- "only once, ever" item is a rule nobody can enforce afterwards.

create table if not exists public.custom_menu_items (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('food','care','date')),
  name text not null check (char_length(trim(name)) between 1 and 20),
  description text not null default '' check (char_length(description) <= 40),
  price integer not null check (price between 8 and 400),
  created_at timestamptz not null default now()
);

create index if not exists custom_menu_items_couple_idx on public.custom_menu_items(couple_id);
alter table public.custom_menu_items enable row level security;
grant select, insert, update, delete on public.custom_menu_items to authenticated;

drop policy if exists "read couple wishes" on public.custom_menu_items;
create policy "read couple wishes" on public.custom_menu_items for select using (
  exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.couple_id = custom_menu_items.couple_id)
);
drop policy if exists "create couple wishes" on public.custom_menu_items;
create policy "create couple wishes" on public.custom_menu_items for insert with check (
  created_by = auth.uid() and exists (
    select 1 from public.profiles p where p.user_id = auth.uid() and p.couple_id = custom_menu_items.couple_id
  )
);
drop policy if exists "update couple wishes" on public.custom_menu_items;
create policy "update couple wishes" on public.custom_menu_items for update using (
  exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.couple_id = custom_menu_items.couple_id)
) with check (
  exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.couple_id = custom_menu_items.couple_id)
);
drop policy if exists "delete couple wishes" on public.custom_menu_items;
create policy "delete couple wishes" on public.custom_menu_items for delete using (
  exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.couple_id = custom_menu_items.couple_id)
);

-- An order remembers what kind of wish it was, so retiring a custom wish never
-- rewrites history and the 约会 task no longer has to join back to a catalog
-- the row might have left.
alter table public.orders add column if not exists item_category text;
update public.orders o set item_category = c.category
from public.menu_catalog c where c.id = o.item_id and o.item_category is null;

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
  v_name text;
  v_category text;
  v_price integer;
  v_image text;
  v_limited boolean;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform public.assert_action_limit('place_order', 12, 10);
  select couple_id into v_couple_id from public.profiles where user_id = auth.uid();
  if v_couple_id is null then raise exception 'not paired'; end if;

  select m.name, m.category, m.price, m.image_url, m.is_limited
  into v_name, v_category, v_price, v_image, v_limited
  from public.menu_catalog m where m.id = p_item_id and m.is_active;

  if v_name is null then
    -- A wish this couple wrote themselves. The price still comes from the row,
    -- never from the caller.
    select c.name, c.category, c.price, null::text, false
    into v_name, v_category, v_price, v_image, v_limited
    from public.custom_menu_items c
    where c.id::text = p_item_id and c.couple_id = v_couple_id;
  end if;
  if v_name is null then raise exception 'invalid item'; end if;

  if char_length(coalesce(p_note, '')) > 160 or char_length(coalesce(p_desired_time, '')) > 40 then raise exception 'invalid order details'; end if;
  if char_length(trim(coalesce(p_from_name, ''))) not between 1 and 20 or char_length(trim(coalesce(p_to_name, ''))) not between 1 and 20 then raise exception 'invalid names'; end if;
  if v_limited and exists (
    select 1 from public.orders where couple_id = v_couple_id and item_id = p_item_id and status <> 'rejected'
  ) then raise exception 'limited item already used'; end if;

  update public.profiles
  set coin_balance = profiles.coin_balance - v_price
  where user_id = auth.uid() and profiles.coin_balance >= v_price
  returning profiles.coin_balance into v_balance;
  if v_balance is null then raise exception 'insufficient balance'; end if;

  insert into public.orders(id, couple_id, created_by, item_id, item_name, item_category, image_url, price, note, desired_time, status, from_name, to_name)
  values (p_id, v_couple_id, auth.uid(), p_item_id, v_name, v_category, v_image, v_price, trim(coalesce(p_note, '')), p_desired_time, 'pending', trim(p_from_name), trim(p_to_name));
  perform public.write_audit(v_couple_id, 'order.created', jsonb_build_object('order_id', p_id, 'item_id', p_item_id, 'price', v_price));
  return query select p_id, v_balance;
end;
$$;

-- The 约会 task now reads the category off the order itself, so a custom date
-- wish counts and a deleted one still does.
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
      where o.couple_id = v_couple_id
        and o.status = 'done'
        and o.created_by <> auth.uid()
        and (coalesce(o.completed_at, o.created_at) at time zone public.app_time_zone())::date >= v_period_start
        and (v_requires = 'order-done' or o.item_category = 'date')
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

grant execute on function public.place_couple_order(uuid, text, text, text, integer, text, text, text, text) to authenticated;
grant execute on function public.claim_couple_task(text) to authenticated;
