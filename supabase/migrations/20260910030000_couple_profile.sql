alter table public.couples add column if not exists partner_a_name text not null default '大宝';
alter table public.couples add column if not exists partner_b_name text not null default '二宝';
alter table public.couples add column if not exists started_on date not null default current_date;
alter table public.couples add column if not exists updated_at timestamptz not null default now();

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

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'couples'
  ) then
    alter publication supabase_realtime add table public.couples;
  end if;
end
$$;
