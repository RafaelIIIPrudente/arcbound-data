-- ArcBase Arcbound Services registry — copy-paste for the Supabase SQL editor
-- (Dashboard → SQL Editor → New query → paste → Run). ADDITIVE ONLY — it creates
-- public.services + public.client_services and six SECURITY DEFINER functions, and
-- DROPS/ALTERS nothing that already exists. Same DDL as
-- supabase/migrations/20260802150000_arcbound_services.sql. See ADR 0015.
--
-- ⚠️ RUN THE VERIFICATION QUERIES AT THE BOTTOM ONE AT A TIME, NOT AS A BLOCK.
-- The Supabase SQL editor renders ONLY the LAST statement's result set. This
-- matters more here than usual: the backfill below is an `insert … select … where`,
-- and one of those matching ZERO rows is a SILENT NO-OP. A staff-roles seed against
-- a non-existent email once left ArcBase with no admin at all and reported no error.
--
-- ⚠️ "SERVICE" IS AN OVERLOADED WORD IN THIS REPO. Here it means an ARCBOUND
-- OFFERING — something Arcbound sells to a Client. It is NOT the Service Seam
-- (`src/services/`, the UI↔data boundary defined in CONTEXT.md). The seam module
-- for this table is deliberately named `arcbound-services.ts` and its type
-- `ArcboundService`, never bare `Service`.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ THE RULE EVERYTHING HERE FOLLOWS FROM: VISIBILITY IS DATA, CAPABILITY IS CODE.
--
-- A Service row carries a `handler` naming an ingestion pipeline that EXISTS in
-- code. The set of legal handlers is a CHECK constraint, mirrored by a code-side
-- constant — admins choose from it and can never invent one, because inventing one
-- would name a pipeline nobody wrote.
--
-- A Service with a NULL handler is a REAL, LISTED OFFERING: it appears on the
-- Client, it is countable and reportable. It simply has no upload path and no data
-- tab. "Has a pipeline" and "listed but not ingestible" must never collapse into
-- one another — the same discipline this product applies to absent-vs-zero
-- everywhere else. Adding a row here can never make a pipeline exist.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 1. services — the registry of what Arcbound sells
-- ============================================================================

create table if not exists public.services (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  -- NULL = a listed offering with no ingestion pipeline. See the rule above.
  handler     text,
  status      text not null default 'active',
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  -- ⚠️ NO TRIGGER MAINTAINS THIS. Every mutating function below sets it
  -- explicitly; omitting it there leaves the column quietly lying about a row
  -- that genuinely changed (the same trap `staff_roles.updated_at` carries).
  updated_at  timestamptz not null default now(),

  -- A CHECK rather than an enum: adding a third pipeline later is a one-line
  -- change here plus the code that implements it, not a type migration. The list
  -- is duplicated in `ServiceHandler` in src/services/types.ts — they must agree,
  -- and this constraint is the half that cannot be bypassed.
  constraint services_handler_known check (
    handler is null or handler in ('linkedin_post_metrics', 'outreach_prospects')
  ),
  constraint services_status_known check (status in ('active', 'archived'))
);

-- ⚠️ ONE SERVICE PER PIPELINE, AND THE INDEX IS PARTIAL FOR A REASON.
--
-- Two Services both claiming `linkedin_post_metrics` would render two identical
-- upload tabs writing to the same table, and nothing downstream — not the report,
-- not the counts, not the Client's history — could tell their data apart.
--
-- `where handler is not null` is what keeps NULL handlers freely duplicable: a
-- Service with no pipeline has no identity to collide with. Arcbound may sell any
-- number of non-ingesting offerings; it may not sell the same pipeline twice.
create unique index if not exists services_one_per_handler
  on public.services (handler) where handler is not null;

alter table public.services enable row level security;

-- Readable by any authenticated staff member; written ONLY through the SECURITY
-- DEFINER functions below (the definer owner bypasses RLS). No insert/update/
-- delete policy exists, so there is no route by which a non-admin can write here
-- even with a valid session and their own Supabase token.
drop policy if exists services_select_authenticated on public.services;
create policy services_select_authenticated on public.services
  for select to authenticated using (true);

-- ============================================================================
-- 2. client_services — which Clients receive which Services (the Engagement)
-- ============================================================================

create table if not exists public.client_services (
  -- Deleting a Client removes its engagements: the rows describe that Client and
  -- mean nothing without it.
  client_id  uuid not null references public.clients(id) on delete cascade,

  -- ⚠️ NO `on delete cascade` HERE, DELIBERATELY. The FK's default RESTRICT is
  -- what makes the delete guard REAL: a Service any Client holds cannot be deleted
  -- even if the application layer is bypassed entirely. `delete_service` below
  -- raises a friendlier message naming the count, but the database refuses on its
  -- own — the guard does not depend on anyone calling the right function.
  service_id uuid not null references public.services(id),

  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  primary key (client_id, service_id)
);

alter table public.client_services enable row level security;

drop policy if exists client_services_select_authenticated on public.client_services;
create policy client_services_select_authenticated on public.client_services
  for select to authenticated using (true);

-- ============================================================================
-- 3. create_service — admin-only
-- ============================================================================

create or replace function public.create_service(
  p_name        text,
  p_slug        text,
  p_description text,
  p_handler     text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'admin role required' using errcode = '42501';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'name is required' using errcode = '22004';
  end if;
  if coalesce(trim(p_slug), '') = '' then
    raise exception 'slug is required' using errcode = '22004';
  end if;

  -- `nullif(…, '')` because an HTML form posts an unset optional field as an
  -- EMPTY STRING, not NULL. Without this, "no pipeline" would arrive as '' and be
  -- rejected by the handler CHECK — turning the most common case into an error.
  insert into public.services (name, slug, description, handler)
    values (trim(p_name), trim(p_slug), nullif(trim(p_description), ''),
            nullif(trim(p_handler), ''))
    returning id into v_id;

  return v_id;
end;
$$;

revoke all     on function public.create_service(text, text, text, text) from public;
grant  execute on function public.create_service(text, text, text, text) to authenticated;

-- ============================================================================
-- 4. update_service — admin-only. NOTE WHAT IT CANNOT CHANGE.
-- ============================================================================
--
-- ⚠️ THERE IS NO `p_handler`, AND THAT IS THE WHOLE POINT OF THIS SIGNATURE.
--
-- The handler is set at creation and is IMMUTABLE. Repointing a live Service at a
-- different pipeline would silently reinterpret every engagement already attached
-- to it: Clients recorded as receiving LinkedIn Growth would, without any row
-- changing, be recorded as receiving Outreach — and every historical count derived
-- from that Service would change meaning retroactively, with nothing to show it
-- had happened.
--
-- To change a pipeline: archive the Service and create a new one. That leaves the
-- old engagements pointing at the old, correctly-labelled Service.
create or replace function public.update_service(
  p_id          uuid,
  p_name        text,
  p_description text,
  p_sort_order  int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin role required' using errcode = '42501';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'name is required' using errcode = '22004';
  end if;

  update public.services
     set name        = trim(p_name),
         description = nullif(trim(p_description), ''),
         sort_order  = coalesce(p_sort_order, sort_order),
         updated_at  = now()
   where id = p_id;

  if not found then
    raise exception 'unknown service %', p_id using errcode = '23503';
  end if;
end;
$$;

revoke all     on function public.update_service(uuid, text, text, int) from public;
grant  execute on function public.update_service(uuid, text, text, int) to authenticated;

-- ============================================================================
-- 5. set_service_status — archive / restore, admin-only
-- ============================================================================
--
-- Archiving is the REVERSIBLE way to retire an offering, and is what staff should
-- reach for: it keeps every existing engagement intact and readable. Deletion
-- (below) is the irreversible one, and is deliberately much harder to do.
create or replace function public.set_service_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin role required' using errcode = '42501';
  end if;

  if p_status not in ('active', 'archived') then
    raise exception 'unknown status %', p_status using errcode = '22023';
  end if;

  update public.services
     set status     = p_status,
         updated_at = now()
   where id = p_id;

  if not found then
    raise exception 'unknown service %', p_id using errcode = '23503';
  end if;
end;
$$;

revoke all     on function public.set_service_status(uuid, text) from public;
grant  execute on function public.set_service_status(uuid, text) to authenticated;

-- ============================================================================
-- 6. delete_service — admin-only, and refused while anyone receives it
-- ============================================================================
--
-- ⚠️ HARD DELETE IS A TYPO ERASER, NOT A RETIREMENT TOOL. Use archive to retire an
-- offering. This exists only so a Service created by mistake, before anyone was
-- assigned to it, can be removed rather than cluttering the registry for ever.
--
-- The count below produces a message a human can act on ("3 clients still receive
-- this"). It is NOT what enforces the rule: `client_services.service_id` has no
-- cascade, so the foreign key refuses the delete on its own even if this function
-- is bypassed. Two layers, and the one that cannot be skipped is the database's.
create or replace function public.delete_service(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refs bigint;
begin
  if not public.is_admin() then
    raise exception 'admin role required' using errcode = '42501';
  end if;

  select count(*) into v_refs
    from public.client_services
   where service_id = p_id;

  if v_refs > 0 then
    raise exception 'cannot delete: % client(s) still receive this service', v_refs
      using errcode = '23503';
  end if;

  delete from public.services where id = p_id;

  if not found then
    raise exception 'unknown service %', p_id using errcode = '23503';
  end if;
end;
$$;

revoke all     on function public.delete_service(uuid) from public;
grant  execute on function public.delete_service(uuid) to authenticated;

-- ============================================================================
-- 7. set_client_services — replace one Client's whole Service set, admin-only
-- ============================================================================
--
-- Idempotent by construction: it computes the difference rather than appending, so
-- submitting the same set twice is a no-op and submitting an empty set clears the
-- Client. `created_by` is stamped from `auth.uid()` — the ADMIN who made the
-- assignment, which the definer context still exposes because the caller's session
-- is intact (SECURITY DEFINER changes the executing role, not `auth.uid()`).
create or replace function public.set_client_services(
  p_client_id   uuid,
  p_service_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin role required' using errcode = '42501';
  end if;

  if not exists (select 1 from public.clients where id = p_client_id) then
    raise exception 'unknown client %', p_client_id using errcode = '23503';
  end if;

  -- Remove what is no longer selected. A NULL array is treated as "none": the
  -- `is null` branch is required because `service_id <> all(null)` is NULL, not
  -- true, and would delete nothing.
  delete from public.client_services
   where client_id = p_client_id
     and (p_service_ids is null or service_id <> all (p_service_ids));

  -- Add what is newly selected. Unknown ids are rejected by the foreign key rather
  -- than checked here — the FK's refusal is the same answer, and cannot drift.
  insert into public.client_services (client_id, service_id, created_by)
  select p_client_id, sid, auth.uid()
    from unnest(coalesce(p_service_ids, '{}'::uuid[])) as sid
  on conflict (client_id, service_id) do nothing;
end;
$$;

revoke all     on function public.set_client_services(uuid, uuid[]) from public;
grant  execute on function public.set_client_services(uuid, uuid[]) to authenticated;

-- ============================================================================
-- 8. list_services_admin — the registry plus what depends on it, admin-only
-- ============================================================================
--
-- ⚠️ `upload_count` IS DERIVED FROM THE HANDLER, NOT FROM A JOIN, AND CANNOT BE.
--
-- There is no `service_id` column on `public.uploads` or `public.outreach_uploads`,
-- and this workstream deliberately does not add one: doing so would change the
-- `ingest_metrics` signature, which requires DROP FUNCTION first (a trap this repo
-- has already been bitten by — see the list_staff note in staff-roles-admin.sql).
--
-- The mapping is sound precisely BECAUSE of the partial unique index above: at most
-- one Service can claim a given handler, so "uploads that went through this
-- Service's pipeline" and "all rows in that pipeline's table" are the same set. A
-- NULL-handler Service has no pipeline and therefore genuinely has zero uploads —
-- that 0 is a fact about the offering, not a missing join.
create or replace function public.list_services_admin()
returns table (
  id           uuid,
  slug         text,
  name         text,
  description  text,
  handler      text,
  status       text,
  sort_order   int,
  client_count bigint,
  upload_count bigint,
  can_delete   boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin role required' using errcode = '42501';
  end if;

  -- Every column is table-qualified: `returns table` declares OUT parameters with
  -- these same names, and an unqualified reference would be ambiguous.
  return query
    select s.id,
           s.slug,
           s.name,
           s.description,
           s.handler,
           s.status,
           s.sort_order,
           coalesce(cc.n, 0),
           case s.handler
             when 'linkedin_post_metrics' then (select count(*) from public.uploads)
             when 'outreach_prospects'    then (select count(*) from public.outreach_uploads)
             else 0::bigint
           end,
           -- Mirrors delete_service's rule so the UI can show the state without
           -- re-deriving it. The database still refuses independently.
           coalesce(cc.n, 0) = 0
      from public.services s
      left join (
        select cs.service_id, count(*)::bigint as n
          from public.client_services cs
         group by cs.service_id
      ) cc on cc.service_id = s.id
     order by s.sort_order, s.name;
end;
$$;

revoke all     on function public.list_services_admin() from public;
grant  execute on function public.list_services_admin() to authenticated;

-- ============================================================================
-- 9. Seed — exactly the two Services that have code behind them today
-- ============================================================================
--
-- Idempotent: re-running this script never duplicates or overwrites. `do nothing`
-- rather than `do update` on purpose — a staff member may legitimately have renamed
-- or re-sorted these, and a re-apply must not silently undo that.
insert into public.services (slug, name, description, handler, sort_order)
values
  ('linkedin-growth', 'LinkedIn Growth',
   'Weekly LinkedIn post-metric scrapes, ingested and reported.',
   'linkedin_post_metrics', 10),
  ('outreach-system', 'Outreach System',
   'Prospect outreach run for the client, ingested as immutable snapshots.',
   'outreach_prospects', 20)
on conflict (slug) do nothing;

-- ============================================================================
-- 10. Backfill — derived from data that already exists
-- ============================================================================
--
-- ⚠️ EVERY ROW THIS WRITES STATES SOMETHING TRUE. A Client is assigned a Service
-- only because ArcBase already holds an upload of that kind for them — the
-- assignment is read out of the evidence, never assumed.
--
-- This matters beyond tidiness: once /upload filters by Services (a later slice), a
-- Client with no Services has NO upload path. Assigning from real history is what
-- stops the day this ships from being a silent outage for every existing Client.
insert into public.client_services (client_id, service_id)
select distinct u.client_id, s.id
  from public.uploads u, public.services s
 where s.slug = 'linkedin-growth'
union
select distinct o.client_id, s.id
  from public.outreach_uploads o, public.services s
 where s.slug = 'outreach-system'
on conflict do nothing;

-- ============================================================================
-- 11. VERIFICATION — ⚠️ RUN THESE ONE AT A TIME
-- ============================================================================
--
-- ⚠️ ONE AT A TIME, EACH IN ITS OWN QUERY. The Supabase SQL editor shows only the
-- LAST statement's result set, so pasting these together silently discards every
-- result above the final one — a check that returned nothing looks exactly like a
-- check you never ran. The seed and backfill above are both
-- `insert … select … where`, and one matching zero rows raises NO error.
--
--   (a) The registry. MUST return exactly two rows, linkedin-growth then
--       outreach-system, both status 'active', with non-null handlers:
--
--         select slug, name, handler, status
--           from public.services order by sort_order;
--
--   (b) The engagements written by the backfill:
--
--         select count(*) from public.client_services;
--
--   (c) Clients with LinkedIn history:
--
--         select count(distinct client_id) from public.uploads;
--
--   (d) Clients with Outreach history:
--
--         select count(distinct client_id) from public.outreach_uploads;
--
--   ⚠️ WHAT (b) MUST EQUAL: (c) + (d) MINUS the number of Clients that appear in
--   BOTH — those receive two Services and are counted once in each of (c) and (d),
--   which is correct, but must not be double-counted when checking (b). To get the
--   overlap directly:
--
--         select count(*) from (
--           select client_id from public.uploads
--           intersect
--           select client_id from public.outreach_uploads
--         ) both_services;
--
--   So: (b) = (c) + (d) − overlap. If (b) is SMALLER than that, the backfill did
--   not match what you expect and must be investigated before any screen reads
--   this table — an under-filled registry becomes a Client who cannot upload.
--
--   (e) Nobody should hold a Service that does not exist, and nothing should be
--       orphaned. This must return ZERO rows:
--
--         select cs.* from public.client_services cs
--           left join public.services s on s.id = cs.service_id
--          where s.id is null;
