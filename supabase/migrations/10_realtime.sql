-- Enable Supabase Realtime for the tables that need live updates.
-- Each table added here will broadcast INSERT / UPDATE / DELETE events
-- to authenticated subscribers who have SELECT permission via RLS.
-- Idempotent: safe to re-run even if a table is already in the publication.

do $$
declare
  t text;
  tables text[] := array[
    'public.notifications',
    'public.submissions',
    'public.revisions',
    'public.projects',
    'public.users'
  ];
begin
  foreach t in array tables loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname || '.' || tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %s', t);
    end if;
  end loop;
end $$;
