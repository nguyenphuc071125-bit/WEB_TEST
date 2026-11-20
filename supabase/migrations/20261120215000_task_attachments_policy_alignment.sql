grant select, insert, update, delete
on public.task_attachments
to authenticated;

drop policy if exists task_attachments_select_workspace
    on public.task_attachments;
drop policy if exists task_attachments_select
    on public.task_attachments;
drop policy if exists task_attachments_insert_assigned_member
    on public.task_attachments;
drop policy if exists task_attachments_insert
    on public.task_attachments;
drop policy if exists task_attachments_delete_own
    on public.task_attachments;
drop policy if exists task_attachments_delete
    on public.task_attachments;
drop policy if exists task_attachments_modify
    on public.task_attachments;

create policy task_attachments_select
on public.task_attachments
for select
to authenticated
using (
    can_read_event(task_event_id(task_id))
);

create policy task_attachments_insert
on public.task_attachments
for insert
to authenticated
with check (
    event_is_writable(task_event_id(task_id))
    and (
        uploaded_by is null
        or (
            member_workspace(uploaded_by) = my_workspace_id()
            and (
                is_leader()
                or uploaded_by = current_member_id()
            )
            and exists (
                select 1
                from public.task_assignments a
                where a.task_id = task_attachments.task_id
                  and a.member_id = task_attachments.uploaded_by
            )
        )
    )
);

create policy task_attachments_modify
on public.task_attachments
for update
to authenticated
using (
    event_is_writable(task_event_id(task_id))
    and (
        uploaded_by = current_member_id()
        or is_leader()
    )
)
with check (
    event_is_writable(task_event_id(task_id))
    and (
        uploaded_by = current_member_id()
        or is_leader()
    )
);

create policy task_attachments_delete
on public.task_attachments
for delete
to authenticated
using (
    event_is_writable(task_event_id(task_id))
    and (
        uploaded_by = current_member_id()
        or is_leader()
    )
);
