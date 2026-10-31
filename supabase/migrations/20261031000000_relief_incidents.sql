-- Solaristic Radar: relief teachers can lodge serious incidents (round 8).
-- Replaces push_relief_entries so it also accepts 'incidents' from a relief teacher's phone.
-- Run once in Supabase → SQL Editor, after 20261027000000_relief_passes.sql. Safe to run again.

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
  where r ->> 'tbl' in ('lessons', 'checkins', 'observations', 'issueTags', 'homework', 'coldCalls', 'brainBreaks', 'assessmentChecks', 'incidents')
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

revoke all on function public.push_relief_entries(text, uuid, jsonb) from public, anon;
grant execute on function public.push_relief_entries(text, uuid, jsonb) to authenticated;
