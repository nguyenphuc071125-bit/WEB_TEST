grant update (member_label)
on table public.members
to authenticated;

drop policy if exists members_update_own_or_workspace_leader
on public.members;

create policy members_update_own_or_workspace_leader
on public.members
for update
to authenticated
using (
    member_id = (
        select tm.member_id
        from public.team_members tm
        where tm.user_id = (select auth.uid())
    )
    or (
        is_leader()
        and workspace_id = my_workspace_id()
    )
)
with check (
    workspace_id = my_workspace_id()
    and (
        member_id = (
            select tm.member_id
            from public.team_members tm
            where tm.user_id = (select auth.uid())
        )
        or is_leader()
    )
);
