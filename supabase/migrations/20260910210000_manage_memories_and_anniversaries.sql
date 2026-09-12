-- Closes the management loop for the two shared record types.
--
-- Anniversaries: the previous single `for all` policy carried a WITH CHECK of
-- `created_by = auth.uid()`, which UPDATE also evaluates. That made a shared
-- date editable only by whoever typed it in first, so the partner's "管理"
-- button silently changed nothing. Insert keeps pinning created_by to the
-- caller; select/update/delete are couple-scoped, because the date belongs to
-- the couple rather than to one account.
--
-- Memories: delete was already limited to the uploader, but there was no update
-- policy at all, so a typo in a caption could only be fixed by deleting the
-- photo and uploading it again. Editing now matches the delete rule.
--
-- The UPDATE grant matters as much as the policy: Postgres checks table
-- privileges before RLS, and 20260910060000 hands `authenticated` an explicit
-- `insert, delete` on memory_entries. Without the grant below the new policy
-- would be dead code wherever Supabase's default privileges are not in force,
-- and the edit would fail with "permission denied for table memory_entries".

drop policy if exists "manage couple anniversaries" on public.anniversaries;

drop policy if exists "read couple anniversaries" on public.anniversaries;
create policy "read couple anniversaries" on public.anniversaries for select using (
  exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.couple_id = anniversaries.couple_id)
);

drop policy if exists "create couple anniversaries" on public.anniversaries;
create policy "create couple anniversaries" on public.anniversaries for insert with check (
  created_by = auth.uid() and exists (
    select 1 from public.profiles p where p.user_id = auth.uid() and p.couple_id = anniversaries.couple_id
  )
);

drop policy if exists "update couple anniversaries" on public.anniversaries;
create policy "update couple anniversaries" on public.anniversaries for update using (
  exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.couple_id = anniversaries.couple_id)
) with check (
  exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.couple_id = anniversaries.couple_id)
);

drop policy if exists "delete couple anniversaries" on public.anniversaries;
create policy "delete couple anniversaries" on public.anniversaries for delete using (
  exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.couple_id = anniversaries.couple_id)
);

grant update on public.memory_entries to authenticated;

drop policy if exists "update own memories" on public.memory_entries;
create policy "update own memories" on public.memory_entries for update using (
  created_by = auth.uid()
) with check (
  created_by = auth.uid() and exists (
    select 1 from public.profiles p where p.user_id = auth.uid() and p.couple_id = memory_entries.couple_id
  )
);
