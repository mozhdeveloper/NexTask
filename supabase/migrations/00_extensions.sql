-- 00_extensions.sql
-- Idempotent. Run first.

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "citext";     -- case-insensitive text (emails)
