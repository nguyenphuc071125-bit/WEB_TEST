alter policy "events_select"
on public.events
to authenticated
using (workspace_id = my_workspace_id());
