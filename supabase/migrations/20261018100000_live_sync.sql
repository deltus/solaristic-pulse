-- Solaristic Radar: live sync of a teacher's records between their own devices.
-- Each row is one record from the app (a class, student, check-in, answer, note…).
-- Names, school IDs, notes and ICP text arrive already encrypted in `enc`; the server never sees them.
-- Ratings, dates and areas stay readable in `data` for reporting.

create sequence if not exists public.sync_seq;

create table if not exists public.sync_rows (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tbl        text not null,
  id         text not null,
  data       jsonb,                         -- readable fields; null when deleted
  enc        text,                          -- AES-GCM ciphertext of identifying fields (base64)
  deleted    boolean not null default false,
  client_at  timestamptz not null,          -- when the change was made on the device (latest wins)
  device_id  uuid,
  seq        bigint not null default nextval('public.sync_seq'),  -- devices pull everything after the last seq they saw
  updated_at timestamptz not null default now(),
  primary key (user_id, tbl, id)
);

create index if not exists sync_rows_user_seq_idx on public.sync_rows (user_id, seq);
alter table public.sync_rows enable row level security;

create policy "sync_rows: read own" on public.sync_rows
  for select to authenticated using (user_id = auth.uid());
create policy "sync_rows: insert own" on public.sync_rows
  for insert to authenticated with check (user_id = auth.uid());
create policy "sync_rows: update own" on public.sync_rows
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

/* Earlier versions are kept whenever a record is overwritten or deleted. */
create table if not exists public.sync_history (
  user_id     uuid not null references auth.users (id) on delete cascade,
  tbl         text not null,
  id          text not null,
  data        jsonb,
  enc         text,
  deleted     boolean not null,
  client_at   timestamptz not null,
  device_id   uuid,
  replaced_at timestamptz not null default now()
);

create index if not exists sync_history_row_idx on public.sync_history (user_id, tbl, id);
alter table public.sync_history enable row level security;

create policy "sync_history: read own" on public.sync_history
  for select to authenticated using (user_id = auth.uid());

create or replace function public.sync_keep_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.data is distinct from new.data or old.enc is distinct from new.enc or old.deleted <> new.deleted then
    insert into sync_history (user_id, tbl, id, data, enc, deleted, client_at, device_id)
    values (old.user_id, old.tbl, old.id, old.data, old.enc, old.deleted, old.client_at, old.device_id);
  end if;
  return new;
end;
$$;

drop trigger if exists sync_rows_history on public.sync_rows;
create trigger sync_rows_history before update on public.sync_rows
  for each row execute function public.sync_keep_history();

/** Saves a batch of changes from a device. A change older than what's stored is ignored (latest wins). */
create or replace function public.push_rows(p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  insert into sync_rows as s (user_id, tbl, id, data, enc, deleted, client_at, device_id)
  select auth.uid(), r->>'tbl', r->>'id', r->'data', r->>'enc', coalesce((r->>'deleted')::boolean, false),
         (r->>'client_at')::timestamptz, nullif(r->>'device_id', '')::uuid
  from jsonb_array_elements(p_rows) r
  on conflict (user_id, tbl, id) do update
    set data = excluded.data, enc = excluded.enc, deleted = excluded.deleted, client_at = excluded.client_at,
        device_id = excluded.device_id, seq = nextval('public.sync_seq'), updated_at = now()
    where excluded.client_at >= s.client_at;
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.push_rows(jsonb) to authenticated;
grant usage on sequence public.sync_seq to authenticated;

/* The teacher's encryption key never leaves their devices; this only lets a device check it was typed correctly. */
create table if not exists public.sync_keys (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  key_check  text not null,
  created_at timestamptz not null default now()
);

alter table public.sync_keys enable row level security;
create policy "sync_keys: read own" on public.sync_keys
  for select to authenticated using (user_id = auth.uid());
create policy "sync_keys: insert own" on public.sync_keys
  for insert to authenticated with check (user_id = auth.uid());

/* Live updates: other devices are told the moment a row changes. */
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sync_rows') then
    alter publication supabase_realtime add table public.sync_rows;
  end if;
end;
$$;
