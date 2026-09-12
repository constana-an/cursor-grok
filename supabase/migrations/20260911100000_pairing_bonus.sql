-- Both partners get 20 甜心币 the moment the shop actually has two people in it.
--
-- A new wallet opens at 8 and the cheapest wish costs 28, so a couple who
-- finish pairing on day one still cannot send anything until they have earned
-- for three or four days. 8 + 20 = 28 makes the first wish reachable the same
-- evening, which is the only way the first run ends in an actual order.
--
-- Granted server-side, once per couple, and only when the second member joins:
-- a local shop cannot mint it, and leaving and rejoining cannot repeat it
-- (`pairing_bonus_at` is stamped on the couple, not on the membership).

alter table public.couples add column if not exists pairing_bonus_at timestamptz;

create or replace function public.join_couple_space(code text, display_name text)
returns table(couple_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple_id uuid;
  v_members integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  perform public.assert_action_limit('join_couple', 8, 60);
  select id into v_couple_id from public.couples where invite_code = code;
  if v_couple_id is null then raise exception 'invalid invite code'; end if;

  select count(*) into v_members from public.profiles p where p.couple_id = v_couple_id and p.user_id <> auth.uid();
  if v_members >= 2 then raise exception 'couple is full'; end if;

  insert into public.profiles(user_id, couple_id, display_name)
  values (auth.uid(), v_couple_id, display_name)
  on conflict (user_id) do update set couple_id = excluded.couple_id, display_name = excluded.display_name;

  -- Only on the join that completes the pair, and only the first time.
  update public.couples set pairing_bonus_at = now()
  where id = v_couple_id and pairing_bonus_at is null
    and (select count(*) from public.profiles p where p.couple_id = v_couple_id) >= 2;

  if found then
    update public.profiles set coin_balance = profiles.coin_balance + 20 where profiles.couple_id = v_couple_id;
    perform public.write_audit(v_couple_id, 'couple.pairing_bonus', jsonb_build_object('reward', 20));
  end if;

  return query select v_couple_id;
end;
$$;

grant execute on function public.join_couple_space(text, text) to authenticated;
