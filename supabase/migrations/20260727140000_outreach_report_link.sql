-- ArcBase OUTREACH → REPORT LINK (S6) — CLI migration twin of
-- supabase/outreach-report-link.sql (the two are kept byte-identical by
-- supabase/sql-sync.test.ts).
--
-- ⚠️ A FRESH TIMESTAMP, AND NEVER AN EDIT TO AN APPLIED MIGRATION. This function
-- was last defined in 20260725120000_report_links.sql, which is already applied;
-- editing that file in place would make `supabase db push` skip it and leave the
-- hosted database on the old definition — the exact trap that shipped a broken
-- Report Link gate once already (see supabase/REPORT-LINKS-APPLY.md).
--
-- WHY: a Client may see their outreach as AGGREGATE COUNTS ONLY (ADR 0012). The
-- aggregation therefore happens INSIDE this SECURITY DEFINER function, so not one
-- prospect row — and not one prospect string — ever leaves the database on the
-- public path. Six numbers and one timestamp cross the boundary. Nothing else.
--
-- WHAT IT TOUCHES: exactly one object — it replaces public.report_link_read. It
-- creates no table, drops nothing, and alters nothing. The signature (text, text)
-- is UNCHANGED, so no `drop function` is needed and existing grants survive; they
-- are restated at the foot anyway so this script is complete on its own.
--
-- ⚠️ `create or replace` REPLACES THE WHOLE BODY. Every pre-existing key
-- (client_id, client_name, posts, uploads, attributes) and every pre-existing
-- guard (the revoked-token check, the grant hash + expiry check, `return null` on
-- ANY failure, `security definer`, `set search_path`) is carried over VERBATIM
-- from supabase/report-links.sql below. Dropping one would silently break every
-- live client report, and the test suite could not catch it — it mocks the RPC.
-- If you edit this function again, DIFF IT against the previous definition.
--
-- APPLY BY PASTING THIS SCRIPT INTO THE SUPABASE SQL EDITOR. Do not `db push` —
-- see supabase/REPORT-LINKS-APPLY.md for why the CLI path has burned this repo.
-- Until it is applied the `outreach` key is simply absent, and the public report
-- correctly shows no outreach block at all (never a block of zeros).

-- ============================================================================
-- report_link_read (PUBLIC data read — requires token AND a valid grant)
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
  v_link        public.report_links%rowtype;
  v_client      uuid;
  v_snapshot_id uuid;
  v_snapshot_at timestamptz;
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

  -- ── The outreach aggregate (ADR 0012): SIX NUMBERS AND ONE TIMESTAMP ──────
  --
  -- The Client's CURRENT position, which is the most recent snapshot for them.
  --
  -- ⚠️ THE `id` TIE-BREAK IS NOT DECORATION. Two uploads inside the same second
  -- would otherwise resolve arbitrarily, and the Client's figures could change
  -- between two page loads with no upload having happened in between.
  select ou.id, ou.created_at
    into v_snapshot_id, v_snapshot_at
    from public.outreach_uploads ou
    where ou.client_id = v_client
    order by ou.created_at desc, ou.id desc
    limit 1;

  -- ⚠️ NO SNAPSHOT ⇒ THE KEY STAYS jsonb null, NOT AN OBJECT OF ZEROS. "This
  -- Client has no outreach uploaded" and "this Client's outreach shows zero" are
  -- different sentences and only one of them is ever true.
  --
  -- ⚠️ THESE FOUR PREDICATES ARE A SECOND IMPLEMENTATION OF THE FUNNEL RULE IN
  -- `buildOutreachAnalytics` (src/services/outreach-analytics.ts). THEY CANNOT BE
  -- DEDUPLICATED — computing the client figure in TypeScript would mean shipping
  -- prospect rows out of the database, which is exactly what ADR 0012 forbids —
  -- so a change HERE must be made THERE, and vice versa, or the Client's report
  -- will quietly disagree with the staff Outreach tab. A test in
  -- src/services/outreach-analytics.test.ts pins each predicate against its
  -- TypeScript twin; it fails loudly if either side is edited alone.
  --
  -- The `replied` rule is the subtle one, and it mirrors `canonicalReply`: a BLANK
  -- status is NOT a reply (nobody wrote anything down) while an UNRECOGNISED one
  -- IS (somebody answered and we do not know what they meant). Simplifying it to
  -- `<> 'no reply'` would count every blank cell as an answer, at the narrowest
  -- and most-scrutinised end of the funnel.
  --
  -- KNOWN, DELIBERATE DIVERGENCE: `canonicalReply` strips a hand-typed trailing
  -- ISO date before matching, so it reads "No Reply 2026-07-13" as no-reply while
  -- this counts it as a reply. No such value exists in the observed export (all
  -- eight dated statuses read "Replied"), so the two agree on today's data; if one
  -- ever appears, add the same strip here and to the mirroring test.
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
      'meetings_booked', count(*) filter (where op.meeting_booked_date is not null and btrim(op.meeting_booked_date) <> '')
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
  'Public token+grant-scoped report read. Requires an active token AND a matching UNEXPIRED read grant (minted by resolve_report_link on a successful Access Code check). Returns jsonb {client_id, client_name, posts[], uploads[], attributes[], outreach} for that ONE client, or null on ANY failure (no oracle). `outreach` is AGGREGATE ONLY (ADR 0012) — {snapshot_at, total_prospects, sent, connected, replied, meetings_booked} from the Client''s most recent outreach snapshot, or null when they have none; no prospect row, name, URL, message, note or stage value ever crosses this boundary, and the four funnel predicates mirror buildOutreachAnalytics in src/services/outreach-analytics.ts. anon has no direct bi.*/table access; this definer function is the only path.';

-- ============================================================================
-- Grants — unchanged signature, restated so this script stands alone
-- ============================================================================

revoke all     on function public.report_link_read(text, text) from public;
grant  execute on function public.report_link_read(text, text) to anon, authenticated;
