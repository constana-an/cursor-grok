-- A wish that has not been answered yet can be taken back.
--
-- Until now the only exits from `pending` belonged to the recipient, so the
-- sender's coins were locked until the other person acted — ordering something
-- by mistake, or at a bad moment, had no undo at all. Cancelling refunds the
-- payer, which is why it is an RPC and not a client-side update: the same
-- reason `update_order_status` is one.
--
-- Note the limited-coupon rule has to widen with it. `place_couple_order`
-- treats any non-rejected order as having spent the coupon, so without this a
-- cancelled order would burn a once-per-couple coupon forever.

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('pending','accepted','doing','done','rejected','cancelled'));

create or replace function public.cancel_couple_order(p_order_id uuid)
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
  perform public.assert_action_limit('update_order', 30, 10);

  select o.* into v_order
  from public.orders o
  join public.profiles p on p.couple_id = o.couple_id
  where o.id = p_order_id and p.user_id = auth.uid();
  if v_order.id is null then raise exception 'order not found'; end if;

  -- Only the person who paid may take it back, and only before it is answered.
  if v_order.created_by <> auth.uid() then raise exception 'not the sender'; end if;
  if v_order.status <> 'pending' then raise exception 'invalid transition'; end if;

  update public.orders set status = 'cancelled' where id = p_order_id;
  update public.profiles set coin_balance = profiles.coin_balance + v_order.price
  where user_id = auth.uid()
  returning profiles.coin_balance into v_balance;

  perform public.write_audit(v_order.couple_id, 'order.cancelled', jsonb_build_object('order_id', p_order_id, 'price', v_order.price));
  return query select 'cancelled'::text, v_balance;
end;
$$;

grant execute on function public.cancel_couple_order(uuid) to authenticated;

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
  -- A declined or withdrawn order releases the coupon; anything else holds it.
  if v_limited and exists (
    select 1 from public.orders
    where couple_id = v_couple_id and item_id = p_item_id and status not in ('rejected','cancelled')
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

grant execute on function public.place_couple_order(uuid, text, text, text, integer, text, text, text, text) to authenticated;

-- A decline can carry a sentence, so "这次未接单" stops being the whole story.
alter table public.orders add column if not exists decline_note text
  check (decline_note is null or char_length(decline_note) <= 40);

-- Dropped, not replaced: adding a defaulted third argument would leave the old
-- two-argument function in place and make every existing two-argument call
-- ambiguous ("function is not unique").
drop function if exists public.update_order_status(uuid, text);

create or replace function public.update_order_status(p_order_id uuid, p_status text, p_note text default null)
returns table(order_status text, coin_balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_balance integer;
  v_note text;
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

  v_note := nullif(trim(coalesce(p_note, '')), '');
  if char_length(coalesce(v_note, '')) > 40 then raise exception 'invalid order details'; end if;

  update public.orders
  set status = p_status,
      completed_at = case when p_status = 'done' then now() else completed_at end,
      decline_note = case when p_status = 'rejected' then v_note else decline_note end
  where id = p_order_id;

  if p_status = 'rejected' then
    -- The refund goes back to whoever paid. If they have already left the
    -- couple their profile is gone and there is nothing to refund.
    update public.profiles set coin_balance = profiles.coin_balance + v_order.price
    where user_id = v_order.created_by;
    perform public.write_audit(v_order.couple_id, 'order.refunded', jsonb_build_object('order_id', p_order_id, 'price', v_order.price, 'refunded_to', v_order.created_by));
  end if;

  select profiles.coin_balance into v_balance from public.profiles where user_id = auth.uid();

  perform public.write_audit(v_order.couple_id, 'order.status_changed', jsonb_build_object('order_id', p_order_id, 'from', v_order.status, 'to', p_status));
  return query select p_status, v_balance;
end;
$$;

grant execute on function public.update_order_status(uuid, text, text) to authenticated;
