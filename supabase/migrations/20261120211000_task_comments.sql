create table if not exists public.task_comments (
    comment_id uuid not null default gen_random_uuid(),
    task_id text not null,
    workspace_id text not null,
    parent_id uuid null,
    user_id uuid not null,
    author_name text not null,
    author_avatar text null,
    author_role text null,
    content text not null,
    mentions jsonb not null default '[]'::jsonb,
    is_deleted boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint task_comments_pkey primary key (comment_id),
    constraint task_comments_parent_id_fkey
        foreign key (parent_id) references public.task_comments (comment_id) on delete cascade,
    constraint task_comments_task_id_fkey
        foreign key (task_id) references public.tasks (task_id) on delete cascade,
    constraint task_comments_user_id_fkey
        foreign key (user_id) references auth.users (id) on delete cascade,
    constraint task_comments_workspace_id_fkey
        foreign key (workspace_id) references public.workspaces (workspace_id) on delete cascade
);

create index if not exists idx_task_comments_task_id
    on public.task_comments using btree (task_id, created_at);
create index if not exists idx_task_comments_parent_id
    on public.task_comments using btree (parent_id);
create index if not exists idx_task_comments_workspace_id
    on public.task_comments using btree (workspace_id);

alter table public.task_comments enable row level security;

revoke all on public.task_comments from anon, authenticated, public;
grant select, insert, delete on public.task_comments to authenticated;
grant update (content, mentions, is_deleted, updated_at)
    on public.task_comments to authenticated;

drop policy if exists "Workspace members can view comments" on public.task_comments;
drop policy if exists "Workspace members can insert comments" on public.task_comments;
drop policy if exists "Authors can update own comments" on public.task_comments;
drop policy if exists "Authors and leaders can delete comments" on public.task_comments;

create policy "Workspace members can view comments"
on public.task_comments
for select
to authenticated
using (
    exists (
        select 1
        from public.team_members tm
        where tm.user_id = (select auth.uid())
          and tm.workspace_id = task_comments.workspace_id
    )
    and exists (
        select 1
        from public.tasks t
        join public.events e on e.event_id = t.event_id
        where t.task_id = task_comments.task_id
          and e.workspace_id = task_comments.workspace_id
    )
);

create policy "Workspace members can insert comments"
on public.task_comments
for insert
to authenticated
with check (
    user_id = (select auth.uid())
    and exists (
        select 1
        from public.team_members tm
        where tm.user_id = (select auth.uid())
          and tm.workspace_id = task_comments.workspace_id
    )
    and exists (
        select 1
        from public.tasks t
        join public.events e on e.event_id = t.event_id
        where t.task_id = task_comments.task_id
          and e.workspace_id = task_comments.workspace_id
    )
);

create policy "Authors can update own comments"
on public.task_comments
for update
to authenticated
using (
    user_id = (select auth.uid())
    and is_deleted = false
    and exists (
        select 1
        from public.team_members tm
        where tm.user_id = (select auth.uid())
          and tm.workspace_id = task_comments.workspace_id
    )
    and exists (
        select 1
        from public.tasks t
        join public.events e on e.event_id = t.event_id
        where t.task_id = task_comments.task_id
          and e.workspace_id = task_comments.workspace_id
    )
)
with check (
    user_id = (select auth.uid())
    and exists (
        select 1
        from public.team_members tm
        where tm.user_id = (select auth.uid())
          and tm.workspace_id = task_comments.workspace_id
    )
    and exists (
        select 1
        from public.tasks t
        join public.events e on e.event_id = t.event_id
        where t.task_id = task_comments.task_id
          and e.workspace_id = task_comments.workspace_id
    )
);

create policy "Authors and leaders can delete comments"
on public.task_comments
for delete
to authenticated
using (
    exists (
        select 1
        from public.team_members tm
        where tm.user_id = (select auth.uid())
          and tm.workspace_id = task_comments.workspace_id
    )
    and exists (
        select 1
        from public.tasks t
        join public.events e on e.event_id = t.event_id
        where t.task_id = task_comments.task_id
          and e.workspace_id = task_comments.workspace_id
    )
    and (
        user_id = (select auth.uid())
        or exists (
            select 1
            from public.team_members tm
            where tm.user_id = (select auth.uid())
              and tm.workspace_id = task_comments.workspace_id
              and lower(btrim(coalesce(tm.account_role, ''))) in (
                  'leader',
                  'team_leader',
                  'trưởng nhóm'
              )
        )
    )
);
