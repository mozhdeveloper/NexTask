-- Add project revision request fields
alter table public.projects
  add column if not exists revision_status text check (revision_status in ('pending', 'approved', 'rejected')),
  add column if not exists revision_requested_by text references public.users(id) on delete set null,
  add column if not exists revision_note text;
