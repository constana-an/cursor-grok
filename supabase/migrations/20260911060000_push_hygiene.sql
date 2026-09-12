-- Signing out has to be able to delete its own subscription row, otherwise the
-- phone keeps receiving that couple's pushes after the account has left it.
--
-- The `for all` policy in schema.sql has always allowed this; what was missing
-- is the table privilege. Every other table gets an explicit grant in
-- 20260910060000, and push_subscriptions was skipped — it only worked because
-- Supabase's default privileges happened to cover it, and the policy test skips
-- `for all` policies, so nothing caught the gap.
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Rotated endpoints replace the row for the same user, so knowing when a row was
-- last confirmed is what tells an operator a device has gone quiet.
alter table public.push_subscriptions add column if not exists updated_at timestamptz not null default now();
