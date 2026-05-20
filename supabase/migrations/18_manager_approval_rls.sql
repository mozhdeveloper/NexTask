-- 18_manager_approval_rls.sql
-- Grant managers UPDATE access to revisions and submissions for employees
-- in their own department.
--
-- Depends on: 08_rls_policies.sql must have been applied first (RLS enabled).
-- Safe to re-run (uses DROP IF EXISTS before each CREATE).
--
-- Why: the existing rev_admin_write and sub_admin_write policies are admin-only.
-- Managers who approve/reject revisions were getting silent RLS rejections for
-- the Supabase UPDATE calls inside revisionService.approve() / .reject().

----------------------------------------------------------------
-- REVISIONS: manager can UPDATE (approve/reject) for their dept's employees
----------------------------------------------------------------
drop policy if exists "rev_manager_write" on public.revisions;
create policy "rev_manager_write" on public.revisions
  for update to authenticated
  using (
    public.current_app_role() = 'manager'
    and exists (
      select 1
      from   public.users mgr
      join   public.users emp on emp.department_id = mgr.department_id
      where  mgr.auth_user_id = auth.uid()
        and  emp.id = public.revisions.user_id
    )
  )
  with check (
    public.current_app_role() = 'manager'
    and exists (
      select 1
      from   public.users mgr
      join   public.users emp on emp.department_id = mgr.department_id
      where  mgr.auth_user_id = auth.uid()
        and  emp.id = public.revisions.user_id
    )
  );

----------------------------------------------------------------
-- SUBMISSIONS: manager can UPDATE status/locked for their dept's employees
----------------------------------------------------------------
drop policy if exists "sub_manager_update" on public.submissions;
create policy "sub_manager_update" on public.submissions
  for update to authenticated
  using (
    public.current_app_role() = 'manager'
    and exists (
      select 1
      from   public.users mgr
      join   public.users emp on emp.department_id = mgr.department_id
      where  mgr.auth_user_id = auth.uid()
        and  emp.id = public.submissions.user_id
    )
  )
  with check (
    public.current_app_role() = 'manager'
    and exists (
      select 1
      from   public.users mgr
      join   public.users emp on emp.department_id = mgr.department_id
      where  mgr.auth_user_id = auth.uid()
        and  emp.id = public.submissions.user_id
    )
  );
