revoke update on table public.task_assignments
from public, anon, authenticated;

grant update (assignment_state, is_done)
on public.task_assignments
to authenticated;

drop policy if exists task_assignments_update_own_status
on public.task_assignments;

create policy task_assignments_update_own_status
on public.task_assignments
for update
to authenticated
using (
    exists (
        select 1
        from public.team_members tm
        join public.tasks t on t.task_id = task_assignments.task_id
        join public.events e on e.event_id = t.event_id
        where tm.user_id = auth.uid()
          and tm.member_id = task_assignments.member_id
          and tm.workspace_id = e.workspace_id
          and e.workspace_id = public.my_workspace_id()
    )
)
with check (
    exists (
        select 1
        from public.team_members tm
        join public.tasks t on t.task_id = task_assignments.task_id
        join public.events e on e.event_id = t.event_id
        where tm.user_id = auth.uid()
          and tm.member_id = task_assignments.member_id
          and tm.workspace_id = e.workspace_id
          and e.workspace_id = public.my_workspace_id()
    )
    and lower(coalesce(assignment_state, '')) not in ('completed', 'complete', 'done')
    and coalesce(is_done, false) = false
);

drop policy if exists task_assignments_update_workspace_leader
on public.task_assignments;

create policy task_assignments_update_workspace_leader
on public.task_assignments
for update
to authenticated
using (
    public.is_leader()
    and exists (
        select 1
        from public.tasks t
        join public.events e on e.event_id = t.event_id
        where t.task_id = task_assignments.task_id
          and e.workspace_id = public.my_workspace_id()
    )
)
with check (
    public.is_leader()
    and exists (
        select 1
        from public.tasks t
        join public.events e on e.event_id = t.event_id
        where t.task_id = task_assignments.task_id
          and e.workspace_id = public.my_workspace_id()
    )
);

drop policy if exists task_assignments_update_status_role_guard
on public.task_assignments;

create policy task_assignments_update_status_role_guard
on public.task_assignments
as restrictive
for update
to authenticated
using (
    (
        public.is_leader()
        and exists (
            select 1
            from public.tasks t
            join public.events e on e.event_id = t.event_id
            where t.task_id = task_assignments.task_id
              and e.workspace_id = public.my_workspace_id()
        )
    )
    or (
        exists (
            select 1
            from public.team_members tm
            join public.tasks t on t.task_id = task_assignments.task_id
            join public.events e on e.event_id = t.event_id
            where tm.user_id = auth.uid()
              and tm.member_id = task_assignments.member_id
              and tm.workspace_id = e.workspace_id
              and e.workspace_id = public.my_workspace_id()
        )
        and lower(coalesce(task_assignments.assignment_state, '')) not in ('completed', 'complete', 'done')
        and coalesce(task_assignments.is_done, false) = false
    )
)
with check (
    (
        public.is_leader()
        and exists (
            select 1
            from public.tasks t
            join public.events e on e.event_id = t.event_id
            where t.task_id = task_assignments.task_id
              and e.workspace_id = public.my_workspace_id()
        )
    )
    or (
        exists (
            select 1
            from public.team_members tm
            join public.tasks t on t.task_id = task_assignments.task_id
            join public.events e on e.event_id = t.event_id
            where tm.user_id = auth.uid()
              and tm.member_id = task_assignments.member_id
              and tm.workspace_id = e.workspace_id
              and e.workspace_id = public.my_workspace_id()
        )
        and lower(coalesce(task_assignments.assignment_state, '')) not in ('completed', 'complete', 'done')
        and coalesce(task_assignments.is_done, false) = false
    )
);
