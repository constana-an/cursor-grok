-- The four tables the whole app is built on were never granted to anybody.
--
-- Found by applying every migration to an empty database for the first time and
-- then signing in as a real user. `menu_catalog` loaded; everything else did
-- not:
--
--   authenticated select profiles     -> permission denied for table profiles
--   authenticated select orders       -> permission denied for table orders
--   authenticated select couples      -> permission denied for table couples
--   authenticated select task_claims  -> permission denied for table task_claims
--
-- Postgres checks the table grant before it ever reaches RLS, so the carefully
-- written "read own profile" policy never got a chance to run. Deployed to a
-- fresh project this is a shop that cannot open a single screen: no balance, no
-- orders, no partner names, no task state.
--
-- Why it hid for so long: `20260910060000` grants select on the tables it adds
-- (menu_catalog, memory_entries, anniversaries, daily_checkins, …), so the
-- pattern was clearly understood — the four original tables from the first
-- migration were simply never covered, and every check since has verified that
-- *write* policies have matching grants while nothing verified reads.
--
-- The lesson is in the fix: never rely on a schema's default privileges. They
-- differ between a local stack and a hosted project, which is exactly how a
-- schema can look correct everywhere except on the database that matters.

grant select on
  public.profiles,
  public.orders,
  public.couples,
  public.task_claims
to authenticated;

-- The server key bypasses RLS but still needs the table grant, and it had none
-- on anything. A hosted project grants service_role everything by default; a
-- local stack does not, so state it rather than inherit it — that difference is
-- the same trap the four tables above fell into. `notify-partner` reads orders
-- and profiles to decide who to push to and deletes retired push_subscriptions,
-- and back-office work needs the rest.
--
-- This is not a hole in the client lockdown: service_role is the server
-- identity, it never ships to a browser (no `VITE_` variable carries it), and
-- it already bypasses RLS wherever it is used.
grant all on all tables in schema public to service_role;
grant usage on all sequences in schema public to service_role;

-- Writes stay closed: every coin movement and order transition still goes
-- through the SECURITY DEFINER functions, and `20260910120000` /
-- `20260910150000` keep insert/update/delete revoked from anon and
-- authenticated on these tables.
revoke insert, update, delete on public.profiles, public.orders, public.couples, public.task_claims from anon, authenticated;
