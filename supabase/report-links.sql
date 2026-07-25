-- ArcBase Report Links — CONSOLIDATED copy-paste for the Supabase SQL editor
-- (Dashboard → SQL Editor → New query → paste → Run). ADDITIVE ONLY — it creates
-- public.report_links + public.report_link_grants + five SECURITY DEFINER
-- functions and DROPS/ALTERS nothing the analytics engineer owns. Same DDL as
-- supabase/migrations/20260725120000_report_links.sql. See
-- supabase/REPORT-LINKS-APPLY.md.
--
-- The capability that lets ONE Client view their own live report through a
-- tokenized public URL (`/r/<token>`) gated by an out-of-band Access Code. The
-- viewer is NOT an ArcBase user (narrows ADR 0007). Security posture:
--   • URL token stored as-is (128-bit, unguessable); the Access Code is stored
--     ONLY as a bcrypt hash and shown to staff once, at issue/rotate.
--   • anon can ONLY call resolve_report_link (verify + lockout) and
--     report_link_read (data read) — anon has NO direct SELECT on any table or on
--     bi.*, so a token/hash/grant can never be read out. Every mutation and read
--     is a SECURITY DEFINER function.
--   • the two-factor holds all the way to the DATA: report_link_read requires the
--     token AND a short-lived READ GRANT that resolve_report_link mints ONLY on a
--     successful Access Code check. A URL/token holder without a grant reads nothing.
--   • one active link per Client (partial unique index).

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. report_links (app-owned capability record)
-- ============================================================================

create table if not exists public.report_links (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients(id),
  token             text not null unique,
  access_code_hash  text not null,
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id),
  revoked_at        timestamptz,
  last_accessed_at  timestamptz,
  failed_attempts   int not null default 0,
  locked_until      timestamptz
);

create unique index if not exists report_links_one_active_per_client
  on public.report_links (client_id) where revoked_at is null;

alter table public.report_links enable row level security;

-- Authenticated staff may SELECT metadata (the service NEVER selects
-- access_code_hash). Rows are written ONLY by the SECURITY DEFINER functions
-- below (owner bypasses RLS). No insert/update/delete policies, and NO anon
-- policy at all — anon reaches this table exclusively through resolve_report_link.
drop policy if exists report_links_select_authenticated on public.report_links;
create policy report_links_select_authenticated on public.report_links
  for select to authenticated using (true);

-- ============================================================================
-- 1b. report_link_grants (short-lived READ GRANTS minted on a successful gate)
-- ============================================================================
--
-- A read grant is a high-entropy (128-bit) bearer secret minted ONLY when the
-- Access Code passes (see resolve_report_link), stored HASHED with a short expiry.
-- report_link_read requires a matching, unexpired grant before returning any rows,
-- so the URL + Access Code two-factor holds all the way to the DATA. A TABLE (not
-- a column on report_links) so multiple concurrent viewer sessions each hold their
-- own grant with independent expiry. Hashed with sha256 (fast, one-way) — bcrypt is
-- reserved for the LOW-entropy Access Code; a 128-bit random grant needs no slow KDF.
create table if not exists public.report_link_grants (
  id          uuid primary key default gen_random_uuid(),
  link_id     uuid not null references public.report_links(id) on delete cascade,
  grant_hash  text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

create index if not exists report_link_grants_link_idx
  on public.report_link_grants (link_id);

alter table public.report_link_grants enable row level security;
-- NO policies at all: rows are written and read ONLY by the SECURITY DEFINER
-- functions (owner bypasses RLS). anon/authenticated get no direct access — a
-- grant hash can never be read out of the table.

-- ============================================================================
-- 2. resolve_report_link (PUBLIC verify + lockout + grant mint; anon-callable)
-- ============================================================================
--
-- Returns jsonb {status, client_id?, read_grant?} where status is
-- 'ok' | 'invalid' | 'locked'. Deliberately richer than a bare uuid so the app can
-- tell a rate-limit state from a bad credential — WITHOUT leaking whether the URL
-- or the code was wrong: an unknown/revoked token and a wrong code BOTH return
-- 'invalid'. 'locked' only follows repeated failures on a token that already
-- resolved to a row. On 'ok' ONLY it also mints a short-lived read_grant.
create or replace function public.resolve_report_link(p_token text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.report_links%rowtype;
  v_new int;
  v_grant text;
begin
  select * into v_row
    from public.report_links
    where token = p_token and revoked_at is null;
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- An expired lock is cleared, giving the holder a fresh attempt window.
  if v_row.locked_until is not null and v_row.locked_until <= now() then
    update public.report_links
      set failed_attempts = 0, locked_until = null
      where id = v_row.id;
    v_row.failed_attempts := 0;
    v_row.locked_until := null;
  end if;

  if v_row.locked_until is not null and v_row.locked_until > now() then
    return jsonb_build_object('status', 'locked');
  end if;

  if v_row.access_code_hash = crypt(p_code, v_row.access_code_hash) then
    update public.report_links
      set failed_attempts = 0, locked_until = null, last_accessed_at = now()
      where id = v_row.id;
    -- Mint a short-lived READ GRANT — ONLY on this success path (never on a
    -- failure, never derivable from the URL). It carries the Access Code factor
    -- forward to the data read (see report_link_read). Stored hashed; returned raw
    -- once, to be sealed into the signed gate cookie.
    v_grant := encode(gen_random_bytes(16), 'hex');
    delete from public.report_link_grants
      where link_id = v_row.id and expires_at < now();
    insert into public.report_link_grants (link_id, grant_hash, expires_at)
      values (v_row.id, encode(digest(v_grant, 'sha256'), 'hex'), now() + interval '2 hours');
    return jsonb_build_object(
      'status', 'ok', 'client_id', v_row.client_id, 'read_grant', v_grant
    );
  end if;

  v_new := v_row.failed_attempts + 1;
  update public.report_links
    set failed_attempts = v_new,
        locked_until = case when v_new >= 5 then now() + interval '15 minutes' else null end
    where id = v_row.id;

  if v_new >= 5 then
    return jsonb_build_object('status', 'locked');
  end if;
  return jsonb_build_object('status', 'invalid');
end;
$$;

comment on function public.resolve_report_link(text, text) is
  'Public Report Link gate: verifies an out-of-band Access Code against a token, does its own failed-attempt lockout (5 fails -> 15 min), stamps last_accessed_at and mints a short-lived read grant ON SUCCESS ONLY. Returns jsonb {status: ok|invalid|locked, client_id?, read_grant?}. invalid covers BOTH an unknown/revoked token and a wrong code (no auth oracle).';

-- ============================================================================
-- 2b. report_link_read (PUBLIC data read — requires token AND a valid grant)
-- ============================================================================
--
-- The anonymous view calls this with the token (from the URL) AND the read grant
-- (minted by resolve_report_link, carried in the signed gate cookie). BOTH must
-- check out: an active, non-revoked token AND a matching, UNEXPIRED grant. Only
-- then does it return the ONE resolved client's report source. ANY failure —
-- unknown/revoked token, missing grant, wrong grant, expired grant — returns jsonb
-- null, never an error and never a distinguishable message (no oracle). anon has
-- NO direct read on bi.* or these tables; this definer function is the only path.
create or replace function public.report_link_read(p_token text, p_grant text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_link   public.report_links%rowtype;
  v_client uuid;
begin
  select * into v_link
    from public.report_links
    where token = p_token and revoked_at is null;
  if not found then
    return null;
  end if;

  -- The grant is the SECOND factor to the DATA. No matching unexpired grant → no
  -- rows, regardless of a valid token (hashed compare; the grant is 128-bit).
  if not exists (
    select 1 from public.report_link_grants g
    where g.link_id = v_link.id
      and g.grant_hash = encode(digest(p_grant, 'sha256'), 'hex')
      and g.expires_at > now()
  ) then
    return null;
  end if;

  v_client := v_link.client_id;

  -- One entitled subject only: every sub-select is scoped to v_client. Empty
  -- arrays (a client with no posts) are a valid bundle, distinct from null (denied).
  return jsonb_build_object(
    'client_id', v_client,
    'client_name', (select c.name from public.clients c where c.id = v_client),
    'posts', (
      select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
      from bi.linkedin_post_latest p
      where p.client_id = v_client
    ),
    'uploads', (
      select coalesce(jsonb_agg(to_jsonb(u) order by u.created_at), '[]'::jsonb)
      from public.uploads u
      where u.client_id = v_client
    ),
    'attributes', (
      select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
      from public.post_attributes a
      where a.linkedin_post_id in (
        select p.linkedin_post_id from bi.linkedin_post_latest p where p.client_id = v_client
      )
    )
  );
end;
$$;

comment on function public.report_link_read(text, text) is
  'Public token+grant-scoped report read. Requires an active token AND a matching UNEXPIRED read grant (minted by resolve_report_link on a successful Access Code check). Returns jsonb {client_id, client_name, posts[], uploads[], attributes[]} for that ONE client, or null on ANY failure (no oracle). anon has no direct bi.*/table access; this definer function is the only path.';

-- ============================================================================
-- 3. issue_report_link (staff: create the one active link for a Client)
-- ============================================================================
--
-- Returns jsonb {token, access_code} ONCE — the raw code is never stored and
-- never re-displayable. Errors if the Client already has an active link (staff
-- rotate to replace it), which the partial unique index also guarantees.
create or replace function public.issue_report_link(p_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_token text;
  v_code  text;
  v_i     int;
begin
  if p_client_id is null then
    raise exception 'p_client_id is required' using errcode = '22004';
  end if;
  if not exists (select 1 from public.clients where id = p_client_id) then
    raise exception 'unknown client_id %', p_client_id using errcode = '23503';
  end if;
  if exists (
    select 1 from public.report_links
    where client_id = p_client_id and revoked_at is null
  ) then
    raise exception 'client already has an active report link' using errcode = '23505';
  end if;

  v_token := encode(gen_random_bytes(16), 'hex');
  v_code := '';
  for v_i in 1..8 loop
    v_code := v_code || substr(v_alphabet, 1 + (get_byte(gen_random_bytes(1), 0) % 32), 1);
  end loop;

  insert into public.report_links (client_id, token, access_code_hash, created_by)
    values (p_client_id, v_token, crypt(v_code, gen_salt('bf')), auth.uid());

  return jsonb_build_object('token', v_token, 'access_code', v_code);
end;
$$;

-- ============================================================================
-- 4. rotate_report_link (staff: revoke the active link, issue a fresh one)
-- ============================================================================
create or replace function public.rotate_report_link(p_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_token text;
  v_code  text;
  v_i     int;
begin
  if p_client_id is null then
    raise exception 'p_client_id is required' using errcode = '22004';
  end if;
  if not exists (select 1 from public.clients where id = p_client_id) then
    raise exception 'unknown client_id %', p_client_id using errcode = '23503';
  end if;

  update public.report_links
    set revoked_at = now()
    where client_id = p_client_id and revoked_at is null;

  v_token := encode(gen_random_bytes(16), 'hex');
  v_code := '';
  for v_i in 1..8 loop
    v_code := v_code || substr(v_alphabet, 1 + (get_byte(gen_random_bytes(1), 0) % 32), 1);
  end loop;

  insert into public.report_links (client_id, token, access_code_hash, created_by)
    values (p_client_id, v_token, crypt(v_code, gen_salt('bf')), auth.uid());

  return jsonb_build_object('token', v_token, 'access_code', v_code);
end;
$$;

-- ============================================================================
-- 5. revoke_report_link (staff: deactivate the active link)
-- ============================================================================
--
-- Revoking the link cascades to its grants (FK on delete cascade only fires on a
-- delete; revoke is a soft delete, so also drop live grants so a revoked link's
-- outstanding viewer sessions lose data access immediately).
create or replace function public.revoke_report_link(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  delete from public.report_link_grants g
    using public.report_links rl
    where g.link_id = rl.id
      and rl.client_id = p_client_id
      and rl.revoked_at is null;

  update public.report_links
    set revoked_at = now()
    where client_id = p_client_id and revoked_at is null;
end;
$$;

-- ============================================================================
-- 6. Grants — resolve + read are anon+authenticated; issue/rotate/revoke staff only
-- ============================================================================

revoke all     on function public.resolve_report_link(text, text) from public;
grant  execute on function public.resolve_report_link(text, text) to anon, authenticated;

revoke all     on function public.report_link_read(text, text) from public;
grant  execute on function public.report_link_read(text, text) to anon, authenticated;

revoke all     on function public.issue_report_link(uuid) from public;
grant  execute on function public.issue_report_link(uuid) to authenticated;

revoke all     on function public.rotate_report_link(uuid) from public;
grant  execute on function public.rotate_report_link(uuid) to authenticated;

revoke all     on function public.revoke_report_link(uuid) from public;
grant  execute on function public.revoke_report_link(uuid) to authenticated;
