# Outreach System — workstream close-out (session record, 2026-07-27)

- **Type:** Session close-out / state of play. Cross-slice facts that do not
  belong to any one handoff.
- **Branch:** `feat-outreach-system-dashboard` · **HEAD:** `64900b5`
- **Spec:** [`docs/specs/2026-07-27-outreach-system-dashboard.md`](../specs/2026-07-27-outreach-system-dashboard.md)
- **Governing ADR:** [0012 — per-Client snapshots](../adr/0012-outreach-system-per-client-snapshots.md)

## Status: S1–S6 all landed

Every slice in the spec is built and green. Verified by the **planning session**
on the combined tree — not taken from any single executer's report, because two
of them ran concurrently and neither could describe the whole checkout:

```
lint        No ESLint warnings or errors
type:check  clean
test        90 files / 1,289 tests passed
build       compiled, full route table
```

| Slice | What it delivered                                                                |
| ----- | -------------------------------------------------------------------------------- |
| S1    | Data model + atomic ingest (immutable full snapshots, `client_id` at upload)     |
| S2    | "Add Data" reshape + the Outreach upload tab                                     |
| S3    | Client tab — KPIs, the four-column funnel, breakdowns, disclosure block          |
| S4    | Prospect table at viewer parity (24 columns, pills, explicit filterFns)          |
| S4a   | Sticky Full Name + column-visibility toggle defaulting to 8                      |
| S5    | Trends — sent-over-time with stated compression, snapshot-over-snapshot movement |
| S6    | Report Link aggregate — six numbers across the privacy boundary                  |

## Database

All three migrations are **applied to the live Supabase project** by staff via
the SQL editor (never `db push`):

1. the outreach schema (`outreach_uploads` / `outreach_prospects` + ingest RPC);
2. the 5-arg `ingest_metrics` — which also fixed LinkedIn uploads, previously
   broken by an overload;
3. `outreach-report-link.sql` (S6) — replaces `report_link_read`.

**Deploy safety.** The app code is uncommitted, so production does not yet map or
render the new `outreach` key. `readReportLinkSource` maps report-link fields
deliberately, field by field, so the extra key is simply ignored by the deployed
build. There is no half-state and nothing to roll back — applying the SQL ahead of
the code was safe here, and safe by construction rather than by luck.

## Verification the planner performed directly

Beyond re-running the gate:

- **`report_link_read` guards intact.** Read the applied SQL: `security definer`,
  `set search_path = public, extensions`, the revoked-token check, and the hashed
  grant + expiry check are all present and unchanged. All five pre-existing keys
  (`client_id`, `client_name`, `posts`, `uploads`, `attributes`) survive verbatim;
  the only deletion in the diff is `)` → `),` where the new key follows. **The
  omitted-line hazard — the failure mode the whole slice was briefed around — did
  not land.**
- **No prospect string crosses the boundary.** The `outreach` object is `count(*)`
  aggregates plus `v_snapshot_at`; every predicate appears only inside a
  `filter (where …)` clause.
- **The S3 Connected defect** (found earlier this session) is fixed and confirmed
  against the real 1,435-row export: Connection Status reads **217**, the
  stage-index rule read 219. The page would have shown both figures side by side,
  each labelled "Connection Status".

## Open items — all optional, none blocking

1. **The SQL/TS `replied` divergence.** `canonicalReply` strips a hand-typed
   trailing ISO date before matching; the S6 SQL predicate does not. So
   `"No Reply 2026-07-13"` would read no-reply in TypeScript and a reply in SQL.
   **Cannot fire on today's data** — all eight dated statuses read `"Replied …"`,
   which both sides count. Documented with the one-line fix at
   `supabase/outreach-report-link.sql:105-109`. This is a **planner spec error**,
   not an executer error: the executer implemented what was specified and flagged
   the gap rather than unilaterally editing a live definer function. Deferred
   deliberately — changing a security-definer function to close a gap that cannot
   currently fire is worse than the gap.
2. **A real post-metrics upload.** The 5-arg `ingest_metrics` is unconfirmed
   end-to-end; the tests mock the RPC and would stay green against a wrong
   signature. **This is the one gap the automated gate genuinely cannot cover.**
3. **The staff print view.** `/clients/[id]/report/print` does not go through
   `report_link_read`, so it has no outreach block and will not inherit one. If
   clients are ever handed a print/PDF of their Report Link, that path needs the
   block wired deliberately.
4. **Prospects (1,435) as a denominator.** The S6 executer's observation, worth
   weighing: it is the one figure on a client-facing block that invites the reader
   to compute the rate the page refuses to state. Four figures would remove the
   temptation. Left at five pending Bryan's call.
5. **Service→Dataset discriminator** and **export/download** — both parked by
   decision, revisitable under ADR 0012.

## Residual risk, stated plainly

The funnel rule now exists in **TypeScript and in SQL and cannot be
deduplicated** — computing the client figure in TypeScript would mean shipping
prospect rows out of the database, which is exactly what ADR 0012 forbids. That
duplication is the price of the privacy boundary, not a design flaw to be removed
by relaxing the boundary.

It is guarded by ⚠️ comments naming each file from the other, plus eight tests in
`outreach-analytics.test.ts` that read the SQL **as text** and pin each predicate
against its TypeScript twin. That is stronger than a comment — it caught a real
mutation — but **it pins text, not behaviour**. A semantically-equivalent SQL
reformat is a false alarm; a change that preserves the pinned text while altering
meaning elsewhere in the aggregate slips past. Only executing both against
identical rows (pgTAP, Testcontainers, or a seeded CI database) would truly close
it. Recorded as an open risk, not a solved problem.

## Process lesson — do not run two executers in one worktree

S5 and S6 ran concurrently in the same checkout. S6 appended a guard suite to
`outreach-analytics.test.ts` while S5 was editing that same file, and two
`next build` processes collided on `.next/routes-manifest.json`. Nothing was lost
and neither session reverted the other, but **each report described a racing tree
and neither could speak for the combined state** — the planner had to re-run the
gate to establish it. Use separate worktrees, or sequence the slices.

## Git posture at close

Branch `feat-outreach-system-dashboard`, HEAD `64900b5`. All slice work is
**staged but uncommitted**, awaiting Bryan's review and commit.

Two commits sit ahead of `main` that the planning session did not create and has
not touched — `64900b5` (outreach system) and `b74fcb5` (connections count).
Surfaced, never self-healed.
