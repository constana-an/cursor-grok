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
