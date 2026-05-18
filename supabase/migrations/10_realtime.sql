-- Enable Supabase Realtime for the tables that need live updates.
-- Each table added here will broadcast INSERT / UPDATE / DELETE events
-- to authenticated subscribers who have SELECT permission via RLS.

alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.submissions;
alter publication supabase_realtime add table public.revisions;
alter publication supabase_realtime add table public.projects;
alter publication supabase_realtime add table public.users;
