-- ArcBase OUTREACH SNAPSHOT VOID (S1, 2026-08-14) —
-- paste-into-the-SQL-editor twin of
-- supabase/migrations/20260814120000_outreach_void.sql (the two are kept
-- in step by supabase/sql-sync.test.ts, which compares their
-- executable SQL with comments stripped).
--
-- WHY: outreach snapshots are immutable (ADR 0012) and until now there was NO
-- undo path anywhere — not in SQL, not in the app. A snapshot attributed to the
-- wrong Client was permanent from inside ArcBase, and because the Client's own
-- report reads their LATEST snapshot, the mistake was live on a client-facing
-- surface with no remedy short of hand-written SQL.
-- See docs/decisions/2026-08-14-outreach-upload-production-ready.md (Q1–Q6).
--
-- ⚠️ A REVERSIBLE FLAG, NOT A DELETE (D1). Voiding ADDS a fact; it rewrites and
-- destroys nothing, so the record that a mistake happened survives the fix. The
-- decisive argument: the remedy for a mis-click must not itself be
-- irreversible, or the fix is a second mis-click waiting to happen.
--
-- ⚠️ ONE FILE ON PURPOSE, AND IT MUST BE APPLIED WHOLE. The columns, the two
-- RPCs and the report_link_read replacement are one atomic change. If the
-- columns landed and the read replacement did not, the void control would
-- appear to work for staff while the Client's report kept serving the voided
-- snapshot — the void would be a lie on the one surface it exists to correct.
--
-- WHAT IT TOUCHES: two new nullable columns on public.outreach_uploads, two new
-- functions, and one `create or replace` of public.report_link_read. It creates
-- no table, drops nothing, and adds NO RLS policy — see the note at section 2.
--
-- APPLY BY PASTING THIS SCRIPT INTO THE SUPABASE SQL EDITOR. Do not `db push` —
-- see supabase/REPORT-LINKS-APPLY.md for why the CLI path has burned this repo.

-- ============================================================================
-- 1. The void columns (nullable, no default — absence IS the live state)
-- ============================================================================
--
-- ⚠️ NO BOOLEAN. `voided_at is null` means live, and that is the ONLY encoding
-- of the fact. A separate `is_voided` flag alongside a timestamp would be two
-- sources of truth for one thing, and they drift the first time one is written
-- without the other.
--
-- ⚠️ NULLABLE, NO DEFAULT, AND NOT BACKFILLED. Every existing snapshot is live,
-- which is exactly what a null already says — so this migration cannot change
-- the meaning of a single row that already exists.
--
-- `voided_by` records WHO, for the same reason `uploaded_by` does: a correction
-- is an action by a person and the audit trail should say so. It is nullable
-- because auth.uid() is null when a definer function is invoked outside a user
-- session, and a null actor is a better record than a fabricated one.

alter table public.outreach_uploads
  add column if not exists voided_at timestamptz;

alter table public.outreach_uploads
  add column if not exists voided_by uuid references auth.users(id);

comment on column public.outreach_uploads.voided_at is
  'When this snapshot was voided, or NULL when it is live. NULL is the live state — there is deliberately no boolean twin. A voided snapshot is skipped by the Client''s report (see report_link_read below) but remains visible to staff, who must never see a voided-away Client as one who never uploaded.';

comment on column public.outreach_uploads.voided_by is
  'Which auth user voided this snapshot, or NULL when it is live (or when no user session was in scope). Set once, by the FIRST void; a repeated void does not overwrite it, because the first void is the fact.';

-- ============================================================================
-- 2. void_outreach_upload / unvoid_outreach_upload
-- ============================================================================
--
-- ⚠️ THE AUTHORISATION CHECK INSIDE THESE FUNCTIONS IS THE ENTIRE SECURITY
-- BOUNDARY. Both are SECURITY DEFINER, so they run with the definer's
-- privileges and RLS on outreach_uploads DOES NOT APPLY to their bodies. There
-- is no second line of defence behind the `if not (...) then raise` below.
--
-- ⚠️ NO RLS UPDATE POLICY IS ADDED, HERE OR ANYWHERE. Both outreach tables are
-- SELECT-only for `authenticated` and every write goes through a definer
-- function (see outreach-system.sql section 1). Adding an UPDATE policy to let
-- staff set voided_at directly would open a second write path that carries none
-- of the Q4 rule below — the flag could then be set by anyone, on anyone's
-- upload, with no owner check at all.
--
-- Q4: own uploads, or admin. `public.is_admin()` (staff-roles.sql) is reused
-- rather than re-implemented — a second copy of a role check is a second place
-- for it to be wrong.

create or replace function public.void_outreach_upload(p_upload_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_upload public.outreach_uploads%rowtype;
begin
  if p_upload_id is null then
    raise exception 'p_upload_id is required' using errcode = '22004';
  end if;

  select * into v_upload
    from public.outreach_uploads
    where id = p_upload_id;

  -- ⚠️ "NOT FOUND" AND "NOT YOURS" RAISE THE SAME EXCEPTION, DELIBERATELY. A
  -- caller who owns neither must not be able to tell a snapshot that does not
  -- exist from one belonging to another Client — distinguishing them would turn
  -- this function into an oracle for the existence of other Clients' uploads,
  -- the same reasoning that makes report_link_read return null on ANY failure.
  --
  -- ⚠️ THE `coalesce` IS WHAT MAKES THIS CHECK FAIL CLOSED. `uploaded_by` is
  -- NULLABLE (outreach-system.sql — no `not null`), and a null uploader is a
  -- real state: this project applies SQL by pasting into the Supabase editor,
  -- where `auth.uid()` is null, so any row written that way records no uploader.
  -- Without the coalesce, `null = auth.uid()` is NULL, `NULL or false` is NULL,
  -- `not NULL` is NULL — and `if NULL then` DOES NOT FIRE in plpgsql. Control
  -- would fall straight through to the UPDATE and any authenticated user could
  -- void a snapshot whose uploader was never recorded.
  --
  -- ⚠️ THE `coalesce` GOES AROUND THE COMPARISON, NEVER AROUND THE COLUMN.
  -- `coalesce(uploaded_by, auth.uid()) = auth.uid()` would make a null uploader
  -- match EVERY caller — the same hole, written more confidently.
  --
  -- The default is `false` because the safe answer to "is this yours?" under
  -- uncertainty is no. `public.is_admin()` needs no such guard: it returns
  -- `exists(...)`, which is never null.
  if not found or not (coalesce(v_upload.uploaded_by = auth.uid(), false) or public.is_admin()) then
    raise exception 'no such outreach upload, or not yours to void'
      using errcode = '42501';
  end if;

  -- ⚠️ IDEMPOTENT, AND THE FIRST VOID IS THE FACT. A second call must NOT
  -- overwrite voided_at/voided_by: the audit trail records when the snapshot
  -- stopped counting and who stopped it, and a re-void by someone else would
  -- quietly rewrite both. The `where voided_at is null` is what makes this a
  -- no-op rather than an update, so a double-click cannot move the record.
  update public.outreach_uploads
     set voided_at = now(),
         voided_by = auth.uid()
   where id = p_upload_id
     and voided_at is null;

  -- Re-read rather than using `returning`: the update above matches no row on a
  -- repeat call, so `returning` would hand back nothing and the caller could not
  -- tell an idempotent no-op from a failure.
  select * into v_upload
    from public.outreach_uploads
    where id = p_upload_id;

  return jsonb_build_object(
    'upload_id', v_upload.id,
    'client_id', v_upload.client_id,
    'voided_at', v_upload.voided_at,
    'voided_by', v_upload.voided_by
  );
end;
$$;

comment on function public.void_outreach_upload(uuid) is
  'Voids one outreach snapshot, reversibly. SECURITY DEFINER, so the caller check inside IS the security boundary: permitted when the caller is the upload''s uploaded_by, or public.is_admin() (Q4). A missing upload and an upload belonging to someone else raise the SAME exception (42501) so this cannot be used as an existence oracle. IDEMPOTENT — a second void is a no-op and never overwrites the original voided_at/voided_by, because the first void is the fact being recorded. Nothing is deleted or rewritten. Returns {upload_id, client_id, voided_at, voided_by}.';

-- ⚠️ UN-VOID CARRIES THE SAME RULE AS VOID, ON PURPOSE. One rule is easier to
-- reason about than two, and un-void is the SAFE direction: it restores a
-- record that was never destroyed. A stricter rule here (admin-only, say) would
-- mean the person who voided their own upload by mistake could not undo it —
-- reintroducing, one level along, exactly the irreversibility this slice
-- removes.
create or replace function public.unvoid_outreach_upload(p_upload_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_upload public.outreach_uploads%rowtype;
begin
  if p_upload_id is null then
    raise exception 'p_upload_id is required' using errcode = '22004';
  end if;

  select * into v_upload
    from public.outreach_uploads
    where id = p_upload_id;

  -- Same conflation as void_outreach_upload, for the same reason: a caller who
  -- owns neither learns nothing about which of the two cases they hit.
  --
  -- ⚠️ AND THE SAME `coalesce`, FOR THE SAME REASON. `uploaded_by` is nullable,
  -- `null = auth.uid()` is NULL rather than false, and `if NULL then` does not
  -- fire — so the bare comparison would let any authenticated user un-void a
  -- snapshot with no recorded uploader. The coalesce defaults to `false`
  -- because the safe answer to "is this yours?" under uncertainty is no. It
  -- wraps the COMPARISON, never the column.
  if not found or not (coalesce(v_upload.uploaded_by = auth.uid(), false) or public.is_admin()) then
    raise exception 'no such outreach upload, or not yours to un-void'
      using errcode = '42501';
  end if;

  -- ⚠️ IDEMPOTENT. Un-voiding a live snapshot is a no-op, not an error: the
  -- caller asked for a state that already holds, and raising here would make a
  -- double-click look like a failure.
  update public.outreach_uploads
     set voided_at = null,
         voided_by = null
   where id = p_upload_id
     and voided_at is not null;

  select * into v_upload
    from public.outreach_uploads
    where id = p_upload_id;

  return jsonb_build_object(
    'upload_id', v_upload.id,
    'client_id', v_upload.client_id,
    'voided_at', v_upload.voided_at,
    'voided_by', v_upload.voided_by
  );
end;
$$;

comment on function public.unvoid_outreach_upload(uuid) is
  'Restores a voided outreach snapshot by clearing voided_at/voided_by. SECURITY DEFINER, so the caller check inside IS the security boundary: the SAME rule as void_outreach_upload — the upload''s uploaded_by, or public.is_admin() (Q4). Deliberately not stricter: un-void is the safe direction, and an admin-only rule would leave whoever mis-voided their own upload unable to undo it. A missing upload and someone else''s raise the same exception (42501). IDEMPOTENT — un-voiding a live snapshot is a no-op, not an error. Returns {upload_id, client_id, voided_at, voided_by}.';

-- Grants — matching ingest_outreach's posture exactly. Staff only; anon has no
-- business voiding anything, and there is no token path to these.
revoke all     on function public.void_outreach_upload(uuid) from public;
grant  execute on function public.void_outreach_upload(uuid) to authenticated;

revoke all     on function public.unvoid_outreach_upload(uuid) from public;
grant  execute on function public.unvoid_outreach_upload(uuid) to authenticated;

-- ============================================================================
-- 3. report_link_read — the ONE-LINE client-facing change
-- ============================================================================
--
-- ⚠️ THE BODY BELOW IS supabase/outreach-email-report-link.sql's DEFINITION,
-- COPIED VERBATIM APART FROM ONE PREDICATE AND THIS COMMENT. That file is the
-- current live definition (outreach-report-link.sql is superseded history). Its
-- body encodes the funnel rules, the combined-meetings union, and the privacy
-- boundary; a "tidy" rewrite while passing through would risk all three at
-- once, on the least-reviewed path in the system. The ONLY difference is:
--
--     and ou.voided_at is null
--
-- added to the latest-snapshot select. If you edit this function again, DIFF IT
-- against THIS definition, not the one it replaces.
--
-- ⚠️ NO `drop function`. The signature (text, text) is UNCHANGED, so `create or
-- replace` is atomic and existing grants survive. A previous slice's
-- drop+create left an orphaned overload; a test asserts this file contains no
-- `drop function` at all.
--
-- ⚠️ THE ALL-VOIDED CASE NEEDS NO NEW CODE, AND MUST NOT GET ANY. When every
-- snapshot for a Client is voided, the select below matches nothing,
-- v_snapshot_id stays null, and the existing branch leaves `outreach` as jsonb
-- null — which the report already renders as "no outreach", never as zeros.
-- That IS Q3's answer for this case. Do not add a flag, a count, or any new
-- vocabulary to say it a second time.
create or replace function public.report_link_read(p_token text, p_grant text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_link        public.report_links%rowtype;
  v_client      uuid;
  v_snapshot_id uuid;
  v_snapshot_at timestamptz;
  -- Whether THIS snapshot's upload carried the 15 Email — * columns (D3, D9) —
  -- the flag that lets a pre-S1 snapshot render "not in this export" rather
  -- than a false zero, exactly as it does on the staff tab.
  v_has_email_channel boolean;
  v_outreach    jsonb;
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

  -- ── The outreach aggregate (ADR 0012): now NINE numbers, one flag, one
  --    timestamp ─────────────────────────────────────────────────────────
  --
  -- The Client's CURRENT position, which is the most recent snapshot for them.
  --
  -- ⚠️ THE `id` TIE-BREAK IS NOT DECORATION. Two uploads inside the same second
  -- would otherwise resolve arbitrarily, and the Client's figures could change
  -- between two page loads with no upload having happened in between.
  --
  -- ⚠️ NEW (2026-08-14) — `voided_at is null` IS THE WHOLE CLIENT-FACING VOID.
  -- A voided snapshot is not the Client's current position; the next live one
  -- down is, and if there is none the branch below leaves `outreach` jsonb
  -- null. This predicate is the only reason a staff void reaches /r/[token] at
  -- all — without it the void would be honoured in TypeScript and ignored on
  -- the one surface the Client actually reads.
  select ou.id, ou.created_at, ou.has_email_channel
    into v_snapshot_id, v_snapshot_at, v_has_email_channel
    from public.outreach_uploads ou
    where ou.client_id = v_client
      and ou.voided_at is null
    order by ou.created_at desc, ou.id desc
    limit 1;

  -- ⚠️ NO SNAPSHOT ⇒ THE KEY STAYS jsonb null, NOT AN OBJECT OF ZEROS. "This
  -- Client has no outreach uploaded" and "this Client's outreach shows zero" are
  -- different sentences and only one of them is ever true.
  --
  -- ⚠️ THESE PREDICATES ARE A SECOND IMPLEMENTATION OF THE FUNNEL RULES IN
  -- `buildOutreachAnalytics` AND `buildEmailAnalytics`
  -- (src/services/outreach-analytics.ts, src/services/email-analytics.ts).
  -- THEY CANNOT BE DEDUPLICATED — computing the client figure in TypeScript
  -- would mean shipping prospect rows out of the database, which is exactly
  -- what ADR 0012 forbids — so a change HERE must be made THERE, and vice
  -- versa, or the Client's report will quietly disagree with the staff
  -- Outreach tab. A test in src/services/outreach-analytics.test.ts pins each
  -- predicate against its TypeScript twin; it fails loudly if either side is
  -- edited alone.
  --
  -- The `replied`/`email_replied` rules are the subtle ones, and they mirror
  -- `canonicalReply`: a BLANK status is NOT a reply (nobody wrote anything
  -- down) while an UNRECOGNISED one IS (somebody answered and we do not know
  -- what they meant). Simplifying either to `<> 'no reply'` would count every
  -- blank cell as an answer, at the narrowest and most-scrutinised end of each
  -- funnel.
  --
  -- ⚠️ KNOWN, DELIBERATE DIVERGENCE — MEASURED, NOT SPECULATIVE. `canonicalReply`
  -- (src/lib/outreach-vocab.ts) strips a trailing parenthetical qualifier AND a
  -- hand-typed trailing ISO date before matching (S2, D6); this SQL matches
  -- only `<> 'no reply'` on the near-raw value (case-folded, whitespace-
  -- collapsed). A value like `No reply (bounced)` would therefore count as a
  -- REPLY here and as NO REPLY in TypeScript, on EITHER channel. The planner
  -- measured the current export on 2026-08-10: ZERO rows diverge today, on
  -- either `reply_status` or `email_reply_status` — every dated or qualified
  -- value observed already reads a sentiment word, never bare "no reply" with a
  -- trailing note. Do NOT "fix" this by porting the strip into SQL: mirroring
  -- the EXISTING shape keeps this predicate and the LinkedIn one it was copied
  -- from consistent with each other, and a real divergence would first need a
  -- value shaped like `No reply (...)` or `No reply YYYY-MM-DD` to exist at
  -- all. If one ever appears, add the same two strips here, to the LinkedIn
  -- predicate above, and to both mirroring tests in one change.
  --
  -- ⚠️ `combined_meetings` IS A UNION OVER BOTH MEETING COLUMNS, COMPUTED AS ONE
  -- FIGURE (D1, D8) — NEVER THE SUM OF `meetings_booked` AND
  -- `email_meetings_booked`. 8 prospects in the observed export carry a booked
  -- meeting in BOTH columns, so adding the two would overstate the true union
  -- by exactly those 8 (27 where the truth is 19). The `or` below counts each
  -- PERSON once, however many channels booked them.
  if v_snapshot_id is not null then
    select jsonb_build_object(
      'snapshot_at', v_snapshot_at,
      'total_prospects', count(*),
      'sent', count(*) filter (where op.date_sent is not null and btrim(op.date_sent) <> ''),
      'connected', count(*) filter (where lower(btrim(op.connection_status)) = 'connected'),
      'replied', count(*) filter (
        where op.reply_status is not null
          and btrim(op.reply_status) <> ''
          and lower(regexp_replace(btrim(op.reply_status), '\s+', ' ', 'g')) <> 'no reply'
      ),
      'meetings_booked', count(*) filter (where op.meeting_booked_date is not null and btrim(op.meeting_booked_date) <> ''),
      'has_email_channel', v_has_email_channel,
      'email_sent', count(*) filter (where op.email_date_emailed is not null and btrim(op.email_date_emailed) <> ''),
      'email_replied', count(*) filter (
        where op.email_reply_status is not null
          and btrim(op.email_reply_status) <> ''
          and lower(regexp_replace(btrim(op.email_reply_status), '\s+', ' ', 'g')) <> 'no reply'
      ),
      'email_meetings_booked', count(*) filter (where op.email_meeting_booked_date is not null and btrim(op.email_meeting_booked_date) <> ''),
      'combined_meetings', count(*) filter (
        where (op.meeting_booked_date is not null and btrim(op.meeting_booked_date) <> '')
           or (op.email_meeting_booked_date is not null and btrim(op.email_meeting_booked_date) <> '')
      )
    )
    into v_outreach
    from public.outreach_prospects op
    where op.outreach_upload_id = v_snapshot_id;
  end if;

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
    ),
    'outreach', v_outreach
  );
end;
$$;

comment on function public.report_link_read(text, text) is
  'Public token+grant-scoped report read. Requires an active token AND a matching UNEXPIRED read grant (minted by resolve_report_link on a successful Access Code check). Returns jsonb {client_id, client_name, posts[], uploads[], attributes[], outreach} for that ONE client, or null on ANY failure (no oracle). `outreach` is AGGREGATE ONLY (ADR 0012) — {snapshot_at, total_prospects, sent, connected, replied, meetings_booked, has_email_channel, email_sent, email_replied, email_meetings_booked, combined_meetings} from the Client''s most recent NON-VOIDED outreach snapshot, or null when they have none; no prospect row, name, URL, message, note, stage or email address ever crosses this boundary. VOIDED SNAPSHOTS ARE SKIPPED (2026-08-14, Q3) — the next live snapshot down becomes the Client''s current position, and when every snapshot is voided `outreach` is null, which the report renders as no outreach rather than as zeros. `has_email_channel` records whether THAT snapshot carried the Email columns (D3, D9) — false or absent both mean "not in this export", never a zeroed Email funnel. `combined_meetings` is a UNION over both meeting-booked columns (D1, D8), never their sum. The eight funnel predicates mirror buildOutreachAnalytics and buildEmailAnalytics in src/services/outreach-analytics.ts and src/services/email-analytics.ts. anon has no direct bi.*/table access; this definer function is the only path.';

-- ============================================================================
-- Grants — unchanged signature, restated so this script stands alone
-- ============================================================================

revoke all     on function public.report_link_read(text, text) from public;
grant  execute on function public.report_link_read(text, text) to anon, authenticated;
