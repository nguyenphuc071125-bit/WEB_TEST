grant select, insert
on table public.notifications
to authenticated;

grant update (is_read, read_at) on table public.notifications to authenticated;

drop policy if exists notifications_select_own_from_app on public.notifications;

create policy notifications_select_own_from_app
on public.notifications
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists notifications_insert_own_from_app on public.notifications;

create policy notifications_insert_own_from_app
on public.notifications
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists notifications_update_own_from_app on public.notifications;

create policy notifications_update_own_from_app
on public.notifications
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
