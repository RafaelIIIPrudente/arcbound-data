-- ArcBase OUTREACH EMAIL CHANNEL → REPORT LINK (S4, 2026-08-10) — CLI
-- migration twin of supabase/outreach-email-report-link.sql (the two are kept
-- byte-identical by supabase/sql-sync.test.ts).
--
-- ⚠️ A FRESH TIMESTAMP, AND NEVER AN EDIT TO AN APPLIED MIGRATION. This
-- function was last defined in 20260727140000_outreach_report_link.sql, which
-- is already applied; editing that file in place would make `supabase db push`
-- skip it and leave the hosted database on the old definition — the exact trap
-- that shipped a broken Report Link gate once already (see
-- supabase/REPORT-LINKS-APPLY.md).
--
-- WHY: the Email channel (docs/decisions/2026-08-03-outreach-email-channel.md,
-- D1–D9) now has its own funnel on the staff Outreach tab (S3); this is the
-- LAST slice of that workstream and carries the same figures across the public
-- boundary, so a Client's own report shows their Email funnel beside their
-- LinkedIn one. A Client may see their outreach as AGGREGATE COUNTS ONLY (ADR
-- 0012) — the aggregation happens INSIDE this SECURITY DEFINER function, same
-- as the LinkedIn side, so no prospect row and no prospect string of any kind
-- ever leaves the database on the public path.
--
-- WHAT IT TOUCHES: exactly one object — it replaces public.report_link_read
-- again. It creates no table, drops nothing, and alters nothing. The signature
-- (text, text) is STILL UNCHANGED (D9) — no dropped/overloaded signature, no
-- default needed — so existing grants survive; they are restated at the foot
-- anyway so this script is complete on its own.
--
-- ⚠️ `create or replace` REPLACES THE WHOLE BODY, AGAIN. Every guard from
-- supabase/outreach-report-link.sql (the revoked-token check, the grant hash +
-- expiry check, `return null` on ANY failure, `security definer`, `set
-- search_path`) and every LinkedIn predicate are carried over VERBATIM below —
-- this script is now the ONE live definition of the function, and the four
-- LinkedIn predicates are reproduced byte-for-byte so nothing drifts by being
-- copied twice. If you edit this function again, DIFF IT against THIS
-- definition, not the one it replaces.
--
-- ⚠️ D9 — THE EMAIL BLOCK IS SAFE IN EITHER DEPLOY ORDER, AND THIS IS WHY. The
-- signature not changing means there is no ordering hazard on the CALL side —
-- the risk is entirely in the returned JSON shape:
--   • SQL FIRST  → the old TypeScript build receives extra keys (has_email_
--     channel, email_sent, email_replied, email_meetings_booked, combined_
--     meetings) it does not read yet. Harmless.
--   • CODE FIRST → the new TypeScript build receives a payload with NONE of
--     those keys, and `src/services/report-links.ts` parses the email block as
--     OPTIONAL for exactly this reason — an absent key renders "not in this
--     export", never zeros, never a crash.

-- ============================================================================
-- report_link_read (PUBLIC data read — requires token AND a valid grant)
-- ============================================================================
--
-- Unchanged from supabase/outreach-report-link.sql except where marked ⚠️ NEW
-- below: still requires an active, non-revoked token AND a matching,
-- UNEXPIRED grant; still returns jsonb null on ANY failure (no oracle); anon
-- still has no direct read on bi.* or these tables.
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
  -- ⚠️ NEW. Whether THIS snapshot's upload carried the 15 Email — * columns
  -- (D3, D9) — the flag that lets a pre-S1 snapshot render "not in this
  -- export" rather than a false zero, exactly as it does on the staff tab.
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
  select ou.id, ou.created_at, ou.has_email_channel
    into v_snapshot_id, v_snapshot_at, v_has_email_channel
    from public.outreach_uploads ou
    where ou.client_id = v_client
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
  'Public token+grant-scoped report read. Requires an active token AND a matching UNEXPIRED read grant (minted by resolve_report_link on a successful Access Code check). Returns jsonb {client_id, client_name, posts[], uploads[], attributes[], outreach} for that ONE client, or null on ANY failure (no oracle). `outreach` is AGGREGATE ONLY (ADR 0012) — {snapshot_at, total_prospects, sent, connected, replied, meetings_booked, has_email_channel, email_sent, email_replied, email_meetings_booked, combined_meetings} from the Client''s most recent outreach snapshot, or null when they have none; no prospect row, name, URL, message, note, stage or email address ever crosses this boundary. `has_email_channel` records whether THAT snapshot carried the Email columns (D3, D9) — false or absent both mean "not in this export", never a zeroed Email funnel. `combined_meetings` is a UNION over both meeting-booked columns (D1, D8), never their sum. The eight funnel predicates mirror buildOutreachAnalytics and buildEmailAnalytics in src/services/outreach-analytics.ts and src/services/email-analytics.ts. anon has no direct bi.*/table access; this definer function is the only path.';

-- ============================================================================
-- Grants — unchanged signature, restated so this script stands alone
-- ============================================================================

revoke all     on function public.report_link_read(text, text) from public;
grant  execute on function public.report_link_read(text, text) to anon, authenticated;
