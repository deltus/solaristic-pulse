-- Solaristic Radar: relief passes (round 6).
-- A class teacher lets a relief (CRT) teacher run one class for up to 5 school days.
--   * The class data for the pass is uploaded already sealed (AES-GCM) with a key made for that pass.
--     The key is only in the pass link after '#', which browsers never send to a server, so the
--     server never sees student names.
--   * The relief teacher signs in with their own email. The server checks the dates, the email
--     (if one was set) and that the pass is used on one device only, logs every use, and hands
--     over the sealed data.
--   * The relief teacher's entries come back sealed with the same pass key into relief_entries.
--     The class teacher's device unlocks them, re-locks them with the teacher's own key (normal
--     sync) and deletes them here.
-- Run once in Supabase → SQL Editor, after the two earlier migrations. Safe to run again.

create table if not exists public.relief_passes (
  id             text primary key,
  owner_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  class_id       text not null,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,            -- end of the last day, the teacher's local time
  relief_email   text,                            -- lower case; null = anyone signed in with the link
  sealed         text not null,                   -- the relief teacher's class data, sealed with the pass key
  cancelled_at   timestamptz,
  claimed_by     uuid references auth.users (id) on delete set null,
  claimed_device uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint relief_passes_dates check (ends_at > starts_at and ends_at - starts_at <= interval '10 days'),
  constraint relief_passes_email check (relief_email is null or relief_email = lower(relief_email))
);

create index if not exists relief_passes_owner_idx on public.relief_passes (owner_id);
alter table public.relief_passes enable row level security;

-- Only the class teacher who made a pass can see or change it. Relief teachers reach it only
-- through the functions below.
drop policy if exists "relief_passes: owner reads" on public.relief_passes;
create policy "relief_passes: owner reads" on public.relief_passes
  for select to authenticated using (owner_id = auth.uid());
drop policy if exists "relief_passes: owner creates" on public.relief_passes;
create policy "relief_passes: owner creates" on public.relief_passes
  for insert to authenticated with check (owner_id = auth.uid() and claimed_by is null and claimed_device is null);
drop policy if exists "relief_passes: owner updates" on public.relief_passes;
create policy "relief_passes: owner updates" on public.relief_passes
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "relief_passes: owner deletes" on public.relief_passes;
create policy "relief_passes: owner deletes" on public.relief_passes
  for delete to authenticated using (owner_id = auth.uid());

/* Every time a pass is opened: who, when, which device. Readable by the class teacher only. */
create table if not exists public.relief_uses (
  id        bigint generated always as identity primary key,
  pass_id   text not null references public.relief_passes (id) on delete cascade,
  user_id   uuid references auth.users (id) on delete set null,
  email     text,
  device_id uuid,
  used_at   timestamptz not null default now()
);

create index if not exists relief_uses_pass_idx on public.relief_uses (pass_id);
alter table public.relief_uses enable row level security;
drop policy if exists "relief_uses: owner reads" on public.relief_uses;
create policy "relief_uses: owner reads" on public.relief_uses
  for select to authenticated using (exists (select 1 from public.relief_passes p where p.id = pass_id and p.owner_id = auth.uid()));

/* What relief teachers entered, sealed with the pass key, waiting for the class teacher's device. */
create table if not exists public.relief_entries (
  pass_id     text not null references public.relief_passes (id) on delete cascade,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  tbl         text not null,
  row_id      text not null,
  enc         text not null,
  client_at   timestamptz not null,
  received_at timestamptz not null default now(),
  primary key (pass_id, tbl, row_id)
);

create index if not exists relief_entries_owner_idx on public.relief_entries (owner_id);
alter table public.relief_entries enable row level security;
drop policy if exists "relief_entries: owner reads" on public.relief_entries;
create policy "relief_entries: owner reads" on public.relief_entries
  for select to authenticated using (owner_id = auth.uid());
drop policy if exists "relief_entries: owner deletes" on public.relief_entries;
create policy "relief_entries: owner deletes" on public.relief_entries
  for delete to authenticated using (owner_id = auth.uid());

/**
 * Relief teacher: open a pass on this device. Checks the dates, the email and the one-device rule,
 * locks the pass to this device on first use, logs the use and returns the sealed class data.
 * Errors (shown to the relief teacher): not-signed-in, not-found, cancelled, not-yet, expired,
 * wrong-email, other-device.
 */
create or replace function public.claim_relief_pass(p_id text, p_device uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p relief_passes;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then raise exception 'not-signed-in'; end if;
  select * into p from relief_passes where id = p_id for update;
  if not found then raise exception 'not-found'; end if;
  if p.cancelled_at is not null then raise exception 'cancelled'; end if;
  if now() < p.starts_at then raise exception 'not-yet'; end if;
  if now() > p.ends_at then raise exception 'expired'; end if;
  if p.relief_email is not null and p.relief_email <> v_email then raise exception 'wrong-email'; end if;
  if p.claimed_device is not null and (p.claimed_device <> p_device or p.claimed_by is distinct from auth.uid()) then
    raise exception 'other-device';
  end if;
  update relief_passes set claimed_by = auth.uid(), claimed_device = p_device, updated_at = now()
    where id = p_id and claimed_device is null;
  insert into relief_uses (pass_id, user_id, email, device_id) values (p_id, auth.uid(), v_email, p_device);
  return jsonb_build_object('sealed', p.sealed, 'class_id', p.class_id, 'ends_at', p.ends_at);
end;
$$;

/** Relief teacher: is the pass still usable on this device? 'active', 'cancelled' or 'expired' (no use is logged). */
create or replace function public.relief_pass_state(p_id text, p_device uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  p relief_passes;
begin
  if auth.uid() is null then raise exception 'not-signed-in'; end if;
  select * into p from relief_passes where id = p_id;
  if not found then return 'cancelled'; end if;
  if p.claimed_by is distinct from auth.uid() or p.claimed_device is distinct from p_device then raise exception 'other-device'; end if;
  if p.cancelled_at is not null then return 'cancelled'; end if;
  if now() > p.ends_at then return 'expired'; end if;
  return 'active';
end;
$$;

/**
 * Relief teacher: send sealed entries back. Only from the device the pass is locked to, only
 * for the record types a relief teacher can make, at most 500 at a time (each under 200 KB), and only for changes
 * made before the pass ended or was cancelled (unsent entries can still arrive for 2 days after).
 */
create or replace function public.push_relief_entries(p_id text, p_device uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  p relief_passes;
  v_until timestamptz;
  n integer;
begin
  if auth.uid() is null then raise exception 'not-signed-in'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'bad-batch'; end if;
  select * into p from relief_passes where id = p_id;
  if not found then raise exception 'not-found'; end if;
  if p.claimed_by is distinct from auth.uid() or p.claimed_device is distinct from p_device then raise exception 'other-device'; end if;
  v_until := least(coalesce(p.cancelled_at, 'infinity'::timestamptz), p.ends_at);
  if now() > v_until + interval '2 days' then raise exception 'expired'; end if;
  insert into relief_entries as e (pass_id, owner_id, tbl, row_id, enc, client_at)
  select p_id, p.owner_id, r ->> 'tbl', r ->> 'id', r ->> 'enc', (r ->> 'client_at')::timestamptz
  from jsonb_array_elements(p_rows) r
  where r ->> 'tbl' in ('lessons', 'checkins', 'observations', 'issueTags', 'homework', 'coldCalls', 'brainBreaks', 'assessmentChecks')
    and coalesce(r ->> 'id', '') <> '' and length(r ->> 'id') <= 200
    and coalesce(r ->> 'enc', '') <> '' and length(r ->> 'enc') <= 200000
    and (r ->> 'client_at')::timestamptz <= v_until
  on conflict (pass_id, tbl, row_id) do update
    set enc = excluded.enc, client_at = excluded.client_at, received_at = now()
    where excluded.client_at >= e.client_at;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.claim_relief_pass(text, uuid) from public, anon;
revoke all on function public.relief_pass_state(text, uuid) from public, anon;
revoke all on function public.push_relief_entries(text, uuid, jsonb) from public, anon;
grant execute on function public.claim_relief_pass(text, uuid) to authenticated;
grant execute on function public.relief_pass_state(text, uuid) to authenticated;
grant execute on function public.push_relief_entries(text, uuid, jsonb) to authenticated;
