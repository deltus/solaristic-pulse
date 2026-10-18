-- DANGER: deletes EVERY Solaristic Radar account and everything stored for it.
-- Use only while testing, before anyone relies on the app. This is not a migration: run it by hand in
-- Supabase → SQL Editor. Tables, functions and settings stay; only the data goes.

begin;

-- Removing the users removes their profiles, devices, invites, synced records, history and sync keys
-- (every table references auth.users with ON DELETE CASCADE).
delete from auth.users;

-- Belt and braces, in case anything was left without a user.
truncate public.sync_history, public.sync_rows, public.sync_keys, public.invites, public.devices, public.profiles;

-- Start the sync counter again from 1.
alter sequence public.sync_seq restart with 1;

commit;

-- Check: every count should be 0.
select
  (select count(*) from auth.users)          as users,
  (select count(*) from public.profiles)     as profiles,
  (select count(*) from public.devices)      as devices,
  (select count(*) from public.invites)      as invites,
  (select count(*) from public.sync_rows)    as sync_rows,
  (select count(*) from public.sync_history) as sync_history,
  (select count(*) from public.sync_keys)    as sync_keys;
