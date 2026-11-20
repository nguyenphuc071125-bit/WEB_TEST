create unique index if not exists idx_task_comments_parent_scope
    on public.task_comments (comment_id, task_id, workspace_id);

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.task_comments'::regclass
          and conname = 'task_comments_parent_scope_fkey'
    ) then
        alter table public.task_comments
            add constraint task_comments_parent_scope_fkey
            foreign key (parent_id, task_id, workspace_id)
            references public.task_comments (comment_id, task_id, workspace_id)
            on delete cascade;
    end if;
end
$$;

