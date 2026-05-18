-- 09_auth_seed.sql
-- Creates 3 Supabase Auth users for the demo accounts and links them to public.users.
-- Run this once (uses SQL editor which runs as service_role).
-- Idempotent: skips users that already exist.

do $$
declare
  v_uid uuid;
begin
  ----------------------------------------------------------------
  -- admin@nexvision.local
  ----------------------------------------------------------------
  select id into v_uid from auth.users where email = 'admin@nexvision.local';
  if v_uid is null then
    v_uid := gen_random_uuid();
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'admin@nexvision.local', crypt('password123', gen_salt('bf')),
      now(), now(), now(),
      jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
      jsonb_build_object('name','Admin','role','admin'),
      false, '', '', '', ''
    );
    insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_uid, jsonb_build_object('sub', v_uid::text, 'email','admin@nexvision.local'), 'email', v_uid::text, now(), now(), now());
  end if;
  update public.users set auth_user_id = v_uid where id = 'u_admin' and auth_user_id is null;

  ----------------------------------------------------------------
  -- manager@nexvision.local
  ----------------------------------------------------------------
  select id into v_uid from auth.users where email = 'manager@nexvision.local';
  if v_uid is null then
    v_uid := gen_random_uuid();
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'manager@nexvision.local', crypt('password123', gen_salt('bf')),
      now(), now(), now(),
      jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
      jsonb_build_object('name','Sarah Lee','role','manager'),
      false, '', '', '', ''
    );
    insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_uid, jsonb_build_object('sub', v_uid::text, 'email','manager@nexvision.local'), 'email', v_uid::text, now(), now(), now());
  end if;
  update public.users set auth_user_id = v_uid where id = 'u_manager' and auth_user_id is null;

  ----------------------------------------------------------------
  -- employee@nexvision.local
  ----------------------------------------------------------------
  select id into v_uid from auth.users where email = 'employee@nexvision.local';
  if v_uid is null then
    v_uid := gen_random_uuid();
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'employee@nexvision.local', crypt('password123', gen_salt('bf')),
      now(), now(), now(),
      jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
      jsonb_build_object('name','John Doe','role','employee'),
      false, '', '', '', ''
    );
    insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_uid, jsonb_build_object('sub', v_uid::text, 'email','employee@nexvision.local'), 'email', v_uid::text, now(), now(), now());
  end if;
  update public.users set auth_user_id = v_uid where id = 'u_employee' and auth_user_id is null;
end $$;
