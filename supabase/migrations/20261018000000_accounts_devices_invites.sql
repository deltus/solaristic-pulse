-- Solaristic Radar: accounts, linked devices and invites.
-- Run once in Supabase → SQL Editor (or `supabase db push`).
-- No student data lives in these tables: only the teacher's own account details.

/* ---------- Profiles: one row per signed-in teacher ---------- */
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  school       text not null default '',
  invited_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles: insert own" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

/* ---------- Devices: every phone / PC a teacher signs in on ---------- */
create table if not exists public.devices (
  id         uuid primary key,                -- generated on the device, kept in its local storage
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name       text not null default '',
  platform   text not null default 'web',    -- 'android' | 'web'
  created_at timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  revoked_at timestamptz                       -- set by "Remove"; that device signs itself out next time it checks in
);

create index if not exists devices_user_idx on public.devices (user_id);
alter table public.devices enable row level security;

create policy "devices: read own" on public.devices
  for select to authenticated using (user_id = auth.uid());
create policy "devices: insert own" on public.devices
  for insert to authenticated with check (user_id = auth.uid() and revoked_at is null);
create policy "devices: update own" on public.devices
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "devices: delete own" on public.devices
  for delete to authenticated using (user_id = auth.uid());

/** Called by each device when it opens: records it and reports whether it has been removed. */
create or replace function public.touch_device(p_id uuid, p_name text, p_platform text)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_revoked timestamptz;
begin
  select revoked_at into v_revoked from devices where id = p_id and user_id = auth.uid();
  if found then
    if v_revoked is not null then
      return true;
    end if;
    update devices set last_seen = now(), name = p_name, platform = p_platform where id = p_id;
  else
    insert into devices (id, user_id, name, platform) values (p_id, auth.uid(), p_name, p_platform);
  end if;
  return false;
end;
$$;

grant execute on function public.touch_device(uuid, text, text) to authenticated;

/* ---------- Invites: QR codes and email links to join the app ---------- */
create table if not exists public.invites (
  code          text primary key check (code ~ '^[a-z0-9]{8,32}$'),
  created_by    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  inviter_name  text not null default '',
  invitee_email text,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '30 days',
  accepted_by   uuid references auth.users (id) on delete set null,
  accepted_at   timestamptz
);

create index if not exists invites_created_by_idx on public.invites (created_by);
alter table public.invites enable row level security;

create policy "invites: read own" on public.invites
  for select to authenticated using (created_by = auth.uid());
create policy "invites: create own" on public.invites
  for insert to authenticated with check (created_by = auth.uid() and accepted_by is null);
create policy "invites: delete own" on public.invites
  for delete to authenticated using (created_by = auth.uid());

/** Lets someone who opened an invite link (not signed in yet) see who invited them. Reveals nothing else. */
create or replace function public.invite_details(p_code text)
returns table (inviter_name text, expired boolean, accepted boolean)
language sql
stable
security definer
set search_path = public
as $$
  select i.inviter_name, i.expires_at < now(), i.accepted_by is not null
  from invites i
  where i.code = lower(p_code);
$$;

/** Marks an invite as used by the signed-in teacher and records who invited them. */
create or replace function public.accept_invite(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv invites%rowtype;
begin
  select * into v_inv from invites where code = lower(p_code) for update;
  if not found or v_inv.expires_at < now() or v_inv.created_by = auth.uid() then
    return false;
  end if;
  if v_inv.accepted_by is not null then
    return v_inv.accepted_by = auth.uid();
  end if;
  update invites set accepted_by = auth.uid(), accepted_at = now() where code = v_inv.code;
  insert into profiles (id, invited_by) values (auth.uid(), v_inv.created_by)
    on conflict (id) do update set invited_by = coalesce(profiles.invited_by, excluded.invited_by);
  return true;
end;
$$;

revoke all on function public.invite_details(text) from public;
revoke all on function public.accept_invite(text) from public;
grant execute on function public.invite_details(text) to anon, authenticated;
grant execute on function public.accept_invite(text) to authenticated;
