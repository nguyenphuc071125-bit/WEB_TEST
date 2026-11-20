grant insert, delete on public.task_attachments to authenticated;

drop policy if exists task_attachments_insert_assigned_member
    on public.task_attachments;
drop policy if exists task_attachments_delete_own
    on public.task_attachments;

create policy task_attachments_insert_assigned_member
on public.task_attachments
for insert
to authenticated
with check (
    exists (
        select 1
        from public.team_members tm
        join public.tasks t
          on t.workspace_id = tm.workspace_id
        join public.task_assignments ta
          on ta.task_id = t.task_id
         and ta.member_id = tm.member_id
        where tm.user_id = (select auth.uid())
          and tm.member_id = task_attachments.uploaded_by
          and tm.workspace_id = public.my_workspace_id()
          and t.task_id = task_attachments.task_id
    )
);

create policy task_attachments_delete_own
on public.task_attachments
for delete
to authenticated
using (
    uploaded_by in (
        select tm.member_id
        from public.team_members tm
        where tm.user_id = (select auth.uid())
          and tm.workspace_id = public.my_workspace_id()
    )
    and exists (
        select 1
        from public.tasks t
        join public.task_assignments ta
          on ta.task_id = t.task_id
        where t.task_id = task_attachments.task_id
          and t.workspace_id = public.my_workspace_id()
          and ta.member_id = task_attachments.uploaded_by
    )
);
