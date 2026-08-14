import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OutreachRow } from "@/services/types";

// ── Hermetic: mock the Supabase server client + cookies so nothing hits the DB. ─
const { state, rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  state: {
    tables: {} as Record<string, Record<string, unknown>[]>,
    errors: {} as Record<string, { message: string } | null>,
    fromCalls: [] as string[],
    eqCalls: [] as unknown[][],
    isCalls: [] as unknown[][],
    orderCalls: [] as unknown[][],
    limitCalls: [] as number[],
    selectColumns: [] as string[],
  },
}));
vi.mock("next/headers", () => ({ cookies: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    rpc: rpcMock,
    // A FRESH chainable per query: paged reads build every page before any
    // resolves, so a shared cursor would serve them all the same range and the
    // merge would look correct while being wrong.
    from: (table: string) => {
      state.fromCalls.push(table);
      const chain: Record<string, unknown> = {};
      const filters: [string, unknown][] = [];
      let from = 0;
      // ⚠️ The implicit window PostgREST applies when no range is asked for.
      // Modelling this cap is what lets the regression guards below fail against
      // an unpaged read — the real database returns 1000 rows and a 200, with no
      // error and no signal that anything was left behind.
      let to = PAGE_SIZE - 1;
      let wantsCount = false;
      let limit: number | null = null;

      chain.select = (columns?: unknown, opts?: { count?: string }) => {
        if (typeof columns === "string") state.selectColumns.push(columns);
        if (opts?.count === "exact") wantsCount = true;
        return chain;
      };
      chain.eq = (column: string, value: unknown) => {
        filters.push([column, value]);
        state.eqCalls.push([column, value]);
        return chain;
      };
      // PostgREST's `.is()` — the only way to compare against SQL null, which
      // `.eq()` cannot express. Modelled with the same filter list because
      // `is(col, null)` and `col === null` agree for the fixtures here; the
      // separate call log is what lets a test assert the filter reached the
      // QUERY rather than being applied in TypeScript afterwards.
      chain.is = (column: string, value: unknown) => {
        filters.push([column, value]);
        state.isCalls.push([column, value]);
        return chain;
      };
      chain.order = (...args: unknown[]) => {
        state.orderCalls.push(args);
        return chain;
      };
      chain.limit = (n: number) => {
        limit = n;
        state.limitCalls.push(n);
        return chain;
      };
      chain.range = (f: number, t: number) => {
        from = f;
        to = t;
        return chain;
      };
      chain.then = (resolve: (v: unknown) => unknown) => {
        const error = state.errors[table] ?? null;
        let all = (state.tables[table] ?? []).filter((r) =>
          filters.every(([column, value]) => r[column] === value),
        );
        const count = all.length;
        if (limit !== null) all = all.slice(0, limit);
        return Promise.resolve({
          data: error ? null : all.slice(from, to + 1),
          error,
          count: wantsCount ? count : null,
        }).then(resolve);
      };
      return chain;
    },
  }),
}));

import { MAX_PAGES, PAGE_SIZE } from "@/lib/supabase/paged";

import type { ProspectRow, UploadRow } from "./outreach";
import {
  ingestOutreach,
  latestSnapshot,
  listOutreachUploads,
  PROSPECT_COLUMNS,
  snapshotById,
  UPLOAD_COLUMNS,
} from "./outreach";

const CLIENT = "11111111-1111-1111-1111-111111111111";

function parsedRow(over: Partial<OutreachRow> = {}): OutreachRow {
  return {
    full_name: "Dana Reyes",
    title: "VP Engineering",
    company: "Northwind",
    icp_seg: "Series B SaaS",
    why_they_fit: "hiring 12 engineers",
    what_they_lack: "employer brand",
    what_arcbound_offers: "Tier 2 - founder-led content",
    matching_client_archetype: "Founder / CEO / investor",
    linkedin_url: "https://www.linkedin.com/in/dana-reyes",
    location: "Austin, TX",
    source_citation: "TechCrunch 2026-05-02",
    rationale: "scaling fast",
    linkedin_message: "Hi Dana",
    connection_status: "Pending",
    date_sent: "2026-07-20",
    reply_status: "No Reply",
    follow_up_count: "0",
    last_follow_up_date: null,
    next_touch_date: null,
    meeting_booked_date: null,
    stage: "Requested",
    owner: "Bryan",
    notes: null,
    qualified_icp: "Yes",
    email_best_email: "dana@northwind.io",
    email_mobile: "555-0100",
    email_subject_line: "Quick question about hiring",
    email_message: "Hi Dana - reaching out by email",
    email_status: "Drafted",
    email_date_emailed: "2026-07-21",
    email_reply_status: "No reply",
    email_follow_up_count: "0",
    email_last_follow_up_date: null,
    email_next_touch_date: null,
    email_webinar_registered: "No",
    email_meeting_booked_date: null,
    email_stage: "Drafted",
    email_owner: "Bryan",
    email_notes: null,
    ...over,
  };
}

const uploadRow = (id: string, createdAt: string, over: Record<string, unknown> = {}) => ({
  id,
  client_id: CLIENT,
  row_count: 1435,
  created_at: createdAt,
  has_email_channel: false,
  // ⚠️ LIVE IS THE DEFAULT, AND IT IS SPELT `null` RATHER THAN `false`. S1 stores
  // the void as a nullable timestamp with no boolean twin, so `voided_at: null`
  // IS the live state — a fixture defaulting to `false` would model a column
  // that does not exist.
  uploaded_by: null,
  voided_at: null,
  voided_by: null,
  ...over,
});

const prospectRow = (id: string, uploadId: string, over: Record<string, unknown> = {}) => ({
  id,
  outreach_upload_id: uploadId,
  client_id: CLIENT,
  row_index: 0,
  full_name: "Dana Reyes",
  title: "VP Engineering",
  company: "Northwind",
  icp_seg: "Series B SaaS",
  why_they_fit: "hiring 12 engineers",
  what_they_lack: "employer brand",
  what_arcbound_offers: "Tier 2",
  matching_client_archetype: "Founder / CEO / investor",
  linkedin_url: "https://www.linkedin.com/in/dana-reyes",
  location: "Austin, TX",
  source_citation: "TechCrunch",
  rationale: "scaling fast",
  linkedin_message: "Hi Dana",
  connection_status: "Pending",
  date_sent: "2026-07-20",
  reply_status: "No Reply",
  follow_up_count: "0",
  last_follow_up_date: null,
  next_touch_date: null,
  meeting_booked_date: null,
  stage: "Requested",
  owner: "Bryan",
  notes: null,
  qualified_icp: "Yes",
  email_best_email: "dana@northwind.io",
  email_mobile: "555-0100",
  email_subject_line: "Quick question about hiring",
  email_message: "Hi Dana - reaching out by email",
  email_status: "Drafted",
  email_date_emailed: "2026-07-21",
  email_reply_status: "No reply",
  email_follow_up_count: "0",
  email_last_follow_up_date: null,
  email_next_touch_date: null,
  email_webinar_registered: "No",
  email_meeting_booked_date: null,
  email_stage: "Drafted",
  email_owner: "Bryan",
  email_notes: null,
  ...over,
});

beforeEach(() => {
  rpcMock.mockReset();
  state.tables = {};
  state.errors = {};
  state.fromCalls = [];
  state.eqCalls = [];
  state.isCalls = [];
  state.orderCalls = [];
  state.limitCalls = [];
  state.selectColumns = [];
});

describe("ingestOutreach (seam → RPC)", () => {
  it("calls ingest_outreach with the client id and the parsed rows", async () => {
    rpcMock.mockResolvedValue({ data: { upload_id: "up1", row_count: 2 }, error: null });

    const result = await ingestOutreach(CLIENT, [parsedRow(), parsedRow()]);

    expect(result).toEqual({ uploadId: "up1", rowCount: 2 });
    const [fn, args] = rpcMock.mock.calls[0]!;
    expect(fn).toBe("ingest_outreach");
    expect(args.p_client_id).toBe(CLIENT);
    expect(args.p_rows).toHaveLength(2);
  });

  it("ATTRIBUTES BY THE PASSED CLIENT ID — never by anything in the file", async () => {
    // ⚠️ ADR 0012's central rule. `owner` is "Bryan" on 1,432 of 1,435 rows and
    // `matching_client_archetype` carries real client names; inferring from
    // either would repeat the downstream name-match ADR 0009 already regrets.
    rpcMock.mockResolvedValue({ data: { upload_id: "up1", row_count: 1 }, error: null });

    await ingestOutreach(CLIENT, [parsedRow({ owner: "Someone Else" })]);

    expect(rpcMock.mock.calls[0]![1].p_client_id).toBe(CLIENT);
  });

  it("sends rows BYTE-FOR-BYTE as parsed — no reshaping at the seam (ADR 0009)", async () => {
    rpcMock.mockResolvedValue({ data: { upload_id: "up1", row_count: 1 }, error: null });
    const row = parsedRow({ reply_status: "  Replied 2026-07-13  ", stage: "MEETING BOOKED" });

    await ingestOutreach(CLIENT, [row]);

    expect(rpcMock.mock.calls[0]![1].p_rows[0]).toEqual(row);
  });

  it('sends a blank optional field as NULL — never "" and never 0', async () => {
    rpcMock.mockResolvedValue({ data: { upload_id: "up1", row_count: 1 }, error: null });

    await ingestOutreach(CLIENT, [parsedRow({ next_touch_date: null })]);

    const sent = rpcMock.mock.calls[0]![1].p_rows[0];
    expect(sent.next_touch_date).toBeNull();
    expect(sent.next_touch_date).not.toBe("");
    expect(sent.next_touch_date).not.toBe(0);
  });

  it("does NOT deduplicate — two rows with the same LinkedIn URL both go through", async () => {
    rpcMock.mockResolvedValue({ data: { upload_id: "up1", row_count: 2 }, error: null });

    await ingestOutreach(CLIENT, [parsedRow(), parsedRow({ full_name: "Dana Reyes (dup)" })]);

    const sent = rpcMock.mock.calls[0]![1].p_rows;
    expect(sent).toHaveLength(2);
    expect(sent[0].linkedin_url).toBe(sent[1].linkedin_url);
  });

  it("preserves ROW ORDER, which the RPC turns into row_index", async () => {
    rpcMock.mockResolvedValue({ data: { upload_id: "up1", row_count: 3 }, error: null });

    await ingestOutreach(CLIENT, [
      parsedRow({ full_name: "First" }),
      parsedRow({ full_name: "Second" }),
      parsedRow({ full_name: "Third" }),
    ]);

    expect(rpcMock.mock.calls[0]![1].p_rows.map((r: OutreachRow) => r.full_name)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
  });

  it("throws when the RPC returns an error", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "unknown client_id" } });

    await expect(ingestOutreach(CLIENT, [parsedRow()])).rejects.toThrow(
      /Outreach ingest failed: unknown client_id/,
    );
  });

  it("⚠️ ALWAYS PASSES p_has_email_channel: true (2026-08-03)", async () => {
    // `parseOutreachCsv` requires all 39 headers now (D3): a file missing even
    // one of the 15 `Email — *` columns is a hard parse error that never reaches
    // this function. So every row set that gets here already came from a file
    // that carried the block — there is no live decision to make, only a fact to
    // record for `outreach_uploads.has_email_channel`. A pre-migration snapshot
    // keeps its database-level `default false` untouched; this function never
    // writes `false` for anything it ingests.
    rpcMock.mockResolvedValue({ data: { upload_id: "up1", row_count: 1 }, error: null });

    await ingestOutreach(CLIENT, [parsedRow()]);

    expect(rpcMock.mock.calls[0]![1].p_has_email_channel).toBe(true);
  });

  it("VALIDATES THE RPC ENVELOPE at the boundary rather than trusting it", async () => {
    // A response missing row_count would otherwise surface as `undefined` on a
    // result summary — a screen reporting "undefined rows ingested" instead of
    // an error anyone could act on.
    rpcMock.mockResolvedValue({ data: { upload_id: "up1" }, error: null });

    await expect(ingestOutreach(CLIENT, [parsedRow()])).rejects.toThrow();
  });
});

describe("listOutreachUploads", () => {
  it("reads this client's snapshot headers, newest-first, mapped snake→camel", async () => {
    state.tables.outreach_uploads = [
      uploadRow("up2", "2026-07-27T09:00:00.000Z"),
      uploadRow("up1", "2026-07-20T09:00:00.000Z", { row_count: 1400 }),
      uploadRow("other", "2026-07-26T09:00:00.000Z", { client_id: "another-client" }),
    ];

    const uploads = await listOutreachUploads(CLIENT);

    expect(state.fromCalls).toContain("outreach_uploads");
    expect(state.eqCalls).toContainEqual(["client_id", CLIENT]);
    expect(uploads).toEqual([
      {
        id: "up2",
        clientId: CLIENT,
        rowCount: 1435,
        createdAt: "2026-07-27T09:00:00.000Z",
        hasEmailChannel: false,
        uploadedBy: null,
        voidedAt: null,
        voidedBy: null,
      },
      {
        id: "up1",
        clientId: CLIENT,
        rowCount: 1400,
        createdAt: "2026-07-20T09:00:00.000Z",
        hasEmailChannel: false,
        uploadedBy: null,
        voidedAt: null,
        voidedBy: null,
      },
    ]);
  });

  it("maps has_email_channel through, snake→camel (S2, 2026-08-03)", async () => {
    // ⚠️ THIS IS WHAT LETS A PRE-CHANGE SNAPSHOT RENDER "NOT IN THIS EXPORT"
    // RATHER THAN A FALSE ZERO (D3) — the flag has to survive the read intact.
    state.tables.outreach_uploads = [
      uploadRow("up1", "2026-07-27T09:00:00.000Z", { has_email_channel: true }),
      uploadRow("up2", "2026-07-20T09:00:00.000Z", { has_email_channel: false }),
    ];

    const uploads = await listOutreachUploads(CLIENT);

    expect(uploads!.find((u) => u.id === "up1")!.hasEmailChannel).toBe(true);
    expect(uploads!.find((u) => u.id === "up2")!.hasEmailChannel).toBe(false);
  });

  it("orders by a UNIQUE key so concurrent pages cannot overlap or skip", async () => {
    state.tables.outreach_uploads = [uploadRow("up1", "2026-07-27T09:00:00.000Z")];

    await listOutreachUploads(CLIENT);

    expect(state.orderCalls).toContainEqual(["created_at", { ascending: false }]);
    // `created_at` alone is not a total order — two uploads can share a timestamp.
    expect(state.orderCalls).toContainEqual(["id", { ascending: true }]);
  });

  it("returns an EMPTY ARRAY when this client has never uploaded", async () => {
    state.tables.outreach_uploads = [];

    expect(await listOutreachUploads(CLIENT)).toEqual([]);
  });

  it("returns NULL — not [] — when the read fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.errors.outreach_uploads = { message: "permission denied" };

    expect(await listOutreachUploads(CLIENT)).toBeNull();
    warn.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VOIDED SNAPSHOTS — ONE READER, TWO CALLERS, OPPOSITE REQUIREMENTS.
//
// `listOutreachUploads` is the staff upload history and MUST SHOW voided rows:
// a reversible flag nobody can see is not reversible. `latestSnapshot` is the
// dashboard and MUST SKIP them, or a voided snapshot stays on screen as the
// Client's current position. A blanket filter in the shared reader would be
// wrong in one direction whichever way it pointed, so the reader takes an
// explicit, REQUIRED opt-in and neither caller can inherit the wrong default.
// ─────────────────────────────────────────────────────────────────────────────

describe("listOutreachUploads — staff SEE the voids", () => {
  it("INCLUDES voided snapshots, and carries the void fields through", async () => {
    // ⚠️ THE WHOLE POINT OF A REVERSIBLE FLAG. Hiding voided rows here would
    // leave staff unable to tell a voided snapshot from one that never existed,
    // and unable to un-void it — the flag would be reversible only in SQL.
    state.tables.outreach_uploads = [
      uploadRow("live", "2026-07-27T09:00:00.000Z"),
      uploadRow("void", "2026-07-20T09:00:00.000Z", {
        uploaded_by: "user-1",
        voided_at: "2026-08-14T10:00:00.000Z",
        voided_by: "user-2",
      }),
    ];

    const uploads = await listOutreachUploads(CLIENT);

    expect(uploads!.map((u) => u.id)).toEqual(["live", "void"]);
    expect(uploads!.find((u) => u.id === "void")).toMatchObject({
      uploadedBy: "user-1",
      voidedAt: "2026-08-14T10:00:00.000Z",
      voidedBy: "user-2",
    });
    // Live rows carry nulls, never `false` and never "" — absence is the state.
    expect(uploads!.find((u) => u.id === "live")).toMatchObject({
      uploadedBy: null,
      voidedAt: null,
      voidedBy: null,
    });
  });

  it("does NOT filter on voided_at at all — the history is unfiltered", async () => {
    state.tables.outreach_uploads = [uploadRow("up1", "2026-07-27T09:00:00.000Z")];

    await listOutreachUploads(CLIENT);

    expect(state.isCalls).not.toContainEqual(["voided_at", null]);
  });
});

describe("latestSnapshot — voided snapshots are not the Client's current position", () => {
  it("SKIPS a voided newest snapshot and returns the live one beneath it", async () => {
    state.tables.outreach_uploads = [
      uploadRow("newest", "2026-07-27T09:00:00.000Z", { voided_at: "2026-08-14T10:00:00.000Z" }),
      uploadRow("live", "2026-07-20T09:00:00.000Z"),
    ];
    state.tables.outreach_prospects = [prospectRow("p1", "live")];

    const snapshot = await latestSnapshot(CLIENT);

    expect(snapshot.status).toBe("ok");
    expect(snapshot.status === "ok" && snapshot.upload.id).toBe("live");
  });

  it("filters in the QUERY, not in TypeScript after the read", async () => {
    // ⚠️ NOT A STYLE PREFERENCE. Filtering after the read would mean the newest
    // LIVE snapshot could sit below the pager's cap: truncation drops the OLDEST
    // rows, so a client whose newest 50,000 snapshots were all voided would read
    // as all-voided while a live one existed underneath. A query-side filter
    // pages over live rows only, so `rows[0]` is the newest live snapshot no
    // matter where the cap falls.
    state.tables.outreach_uploads = [uploadRow("up1", "2026-07-27T09:00:00.000Z")];
    state.tables.outreach_prospects = [prospectRow("p1", "up1")];

    await latestSnapshot(CLIENT);

    expect(state.isCalls).toContainEqual(["voided_at", null]);
  });

  it("reports ALL-VOIDED — not empty — when every snapshot was voided", async () => {
    // ⚠️ THE STATE THIS SLICE EXISTS FOR. `empty` means "this Client has never
    // had an outreach upload". For a Client whose snapshots were all voided that
    // sentence is FALSE, and false in a way that invites re-uploading data that
    // is already there.
    state.tables.outreach_uploads = [
      uploadRow("v1", "2026-07-27T09:00:00.000Z", { voided_at: "2026-08-14T10:00:00.000Z" }),
      uploadRow("v2", "2026-07-20T09:00:00.000Z", { voided_at: "2026-08-14T10:00:00.000Z" }),
    ];

    expect(await latestSnapshot(CLIENT)).toEqual({ status: "all-voided", voidedCount: 2 });
  });

  it("still reports EMPTY when there are no snapshots AT ALL", async () => {
    // ⚠️ THE DISCRIMINATOR. Without this, the test above could pass by simply
    // relabelling `empty` as `all-voided` — merging the two states while looking
    // like it separated them. `empty` must still mean exactly what it meant.
    state.tables.outreach_uploads = [];

    expect(await latestSnapshot(CLIENT)).toEqual({ status: "empty" });
  });

  it("reports UNAVAILABLE when the read fails — voiding adds no new failure mode", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.errors.outreach_uploads = { message: "permission denied" };

    expect(await latestSnapshot(CLIENT)).toEqual({ status: "unavailable" });
    warn.mockRestore();
  });

  // ⚠️ NOT TESTED HERE, AND SAID SO RATHER THAN LEFT LOOKING COVERED: the branch
  // where the LIVE read succeeds and the void-COUNT read then fails returns
  // `unavailable`, because "no live snapshots" alone cannot tell all-voided from
  // empty. This harness keys errors by TABLE, so both reads hit
  // `outreach_uploads` together and that split cannot be staged without adding a
  // test-only seam to the production signature — a worse trade than an
  // uncovered branch. The branch is three lines and reads as its own comment.
});

describe("latestSnapshot — the three states stay apart", () => {
  it("reports UNAVAILABLE when the header read fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.errors.outreach_uploads = { message: "permission denied" };

    expect(await latestSnapshot(CLIENT)).toEqual({ status: "unavailable" });
    warn.mockRestore();
  });

  it("reports EMPTY when the client genuinely has no snapshot", async () => {
    // ⚠️ NOT `unavailable`. This is the one state that may render as an empty
    // dashboard; a failed read must never wear that costume.
    state.tables.outreach_uploads = [];

    expect(await latestSnapshot(CLIENT)).toEqual({ status: "empty" });
  });

  it("reports UNAVAILABLE when the header reads but the PROSPECTS fail", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.tables.outreach_uploads = [uploadRow("up1", "2026-07-27T09:00:00.000Z")];
    state.errors.outreach_prospects = { message: "permission denied" };

    // A snapshot header with no readable rows is not a snapshot of zero
    // prospects — reporting `ok` with `[]` would put a zeroed funnel on screen.
    expect(await latestSnapshot(CLIENT)).toEqual({ status: "unavailable" });
    warn.mockRestore();
  });

  it("returns the NEWEST snapshot's prospects, mapped snake→camel", async () => {
    state.tables.outreach_uploads = [
      uploadRow("up2", "2026-07-27T09:00:00.000Z"),
      uploadRow("up1", "2026-07-20T09:00:00.000Z"),
    ];
    state.tables.outreach_prospects = [
      prospectRow("1", "up2"),
      prospectRow("2", "up2", { row_index: 1, full_name: "Sam Okafor" }),
    ];

    const snapshot = await latestSnapshot(CLIENT);

    expect(snapshot.status).toBe("ok");
    if (snapshot.status !== "ok") throw new Error("unreachable");
    expect(snapshot.upload.id).toBe("up2");
    expect(snapshot.upload.rowCount).toBe(1435);
    expect(snapshot.prospects).toHaveLength(2);
    expect(snapshot.prospects[0]!.fullName).toBe("Dana Reyes");
    expect(snapshot.prospects[0]!.linkedinUrl).toBe("https://www.linkedin.com/in/dana-reyes");
    expect(snapshot.prospects[0]!.qualifiedIcp).toBe("Yes");
    expect(snapshot.prospects[0]!.rowIndex).toBe(0);
    expect(snapshot.prospects[1]!.fullName).toBe("Sam Okafor");
    expect(snapshot.truncated).toBe(false);
  });

  it("reads ONLY the newest snapshot's rows — an older snapshot must not leak in", async () => {
    // ⚠️ FILTERING BY client_id ALONE WOULD DOUBLE EVERY COUNT. Each upload
    // re-stores all ~1,435 rows, so after two uploads the client has ~2,870 rows
    // and only the upload id separates them.
    state.tables.outreach_uploads = [
      uploadRow("up2", "2026-07-27T09:00:00.000Z"),
      uploadRow("up1", "2026-07-20T09:00:00.000Z"),
    ];
    state.tables.outreach_prospects = [
      prospectRow("1", "up2"),
      prospectRow("2", "up1"),
      prospectRow("3", "up1"),
    ];

    const snapshot = await latestSnapshot(CLIENT);

    if (snapshot.status !== "ok") throw new Error("expected ok");
    expect(snapshot.prospects).toHaveLength(1);
    expect(state.eqCalls).toContainEqual(["outreach_upload_id", "up2"]);
  });

  it('keeps blank source values NULL — never "", never 0', async () => {
    state.tables.outreach_uploads = [uploadRow("up1", "2026-07-27T09:00:00.000Z")];
    state.tables.outreach_prospects = [
      prospectRow("1", "up1", { next_touch_date: null, meeting_booked_date: null, notes: null }),
    ];

    const snapshot = await latestSnapshot(CLIENT);

    if (snapshot.status !== "ok") throw new Error("expected ok");
    const p = snapshot.prospects[0]!;
    expect(p.nextTouchDate).toBeNull();
    expect(p.meetingBookedDate).toBeNull();
    expect(p.notes).toBeNull();
    expect(p.nextTouchDate).not.toBe("");
    expect(p.nextTouchDate).not.toBe(0);
  });

  it('keeps a literal "0" Follow-up Count as "0" — a value, not a gap', async () => {
    state.tables.outreach_uploads = [uploadRow("up1", "2026-07-27T09:00:00.000Z")];
    state.tables.outreach_prospects = [prospectRow("1", "up1", { follow_up_count: "0" })];

    const snapshot = await latestSnapshot(CLIENT);

    if (snapshot.status !== "ok") throw new Error("expected ok");
    expect(snapshot.prospects[0]!.followUpCount).toBe("0");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // THE REGRESSION GUARD THAT MATTERS MOST ON THIS TABLE.
  //
  // A snapshot is ~1,435 rows and PostgREST caps a response at 1000, SILENTLY —
  // 1000 rows and a 200, no error. An unpaged read here would put a funnel on
  // screen that is short by 435 prospects while looking entirely healthy, and
  // every KPI, breakdown and snapshot-over-snapshot delta downstream would
  // inherit the shortfall. This is the single defect this seam exists to avoid.
  // ───────────────────────────────────────────────────────────────────────────
  it("reads ALL 1,435 prospects past the 1000-row response cap", async () => {
    state.tables.outreach_uploads = [uploadRow("up1", "2026-07-27T09:00:00.000Z")];
    state.tables.outreach_prospects = Array.from({ length: 1435 }, (_, i) =>
      prospectRow(`p${i}`, "up1", { row_index: i }),
    );

    const snapshot = await latestSnapshot(CLIENT);

    if (snapshot.status !== "ok") throw new Error("expected ok");
    expect(snapshot.prospects).toHaveLength(1435);
    // 1000 is precisely the number the defect produces.
    expect(snapshot.prospects).not.toHaveLength(PAGE_SIZE);
    expect(snapshot.truncated).toBe(false);
    expect(snapshot.total).toBe(1435);
  });

  it("orders prospects by a UNIQUE key so concurrent pages cannot overlap or skip", async () => {
    state.tables.outreach_uploads = [uploadRow("up1", "2026-07-27T09:00:00.000Z")];
    state.tables.outreach_prospects = Array.from({ length: PAGE_SIZE + 5 }, (_, i) =>
      prospectRow(`p${i}`, "up1", { row_index: i }),
    );

    await latestSnapshot(CLIENT);

    // ⚠️ `row_index` is NOT unique across a table holding many snapshots — only
    // `id` is. Pages are issued concurrently, so an ambiguous sort lets a row
    // land in two ranges or in neither: a silently WRONG set, not a short one.
    expect(state.orderCalls).toContainEqual(["id", { ascending: true }]);
  });

  it("keeps source order across the page boundary", async () => {
    state.tables.outreach_uploads = [uploadRow("up1", "2026-07-27T09:00:00.000Z")];
    state.tables.outreach_prospects = Array.from({ length: PAGE_SIZE + 3 }, (_, i) =>
      prospectRow(`p${i}`, "up1", { row_index: i }),
    );

    const snapshot = await latestSnapshot(CLIENT);

    if (snapshot.status !== "ok") throw new Error("expected ok");
    expect(snapshot.prospects.map((p) => p.rowIndex).slice(998, 1003)).toEqual([
      998, 999, 1000, 1001, 1002,
    ]);
  });

  it("REPORTS truncation honestly instead of returning a silently short snapshot", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.tables.outreach_uploads = [uploadRow("up1", "2026-07-27T09:00:00.000Z")];
    state.tables.outreach_prospects = Array.from({ length: MAX_PAGES * PAGE_SIZE + 1 }, (_, i) => ({
      id: `p${i}`,
      outreach_upload_id: "up1",
      client_id: CLIENT,
      row_index: i,
    }));

    const snapshot = await latestSnapshot(CLIENT);

    if (snapshot.status !== "ok") throw new Error("expected ok");
    // ⚠️ THE ROWS ARE STILL RETURNED, and `truncated` says they are a PREFIX —
    // deliberately unlike `listUploads`, which nulls a truncated read. A partial
    // funnel that SAYS it is partial is more useful than no funnel at all; a
    // partial funnel that stays silent is the thing that must never happen.
    expect(snapshot.truncated).toBe(true);
    expect(snapshot.total).toBe(MAX_PAGES * PAGE_SIZE + 1);
    expect(snapshot.prospects.length).toBeLessThan(snapshot.total!);
    warn.mockRestore();
  });

  it("asks the database for EVERY prospect column — an omitted one is a permanent gap", async () => {
    // PostgREST returns exactly the columns asked for, so a column missing from
    // the select maps to `undefined` → null on every row: a whole field reading
    // as "never recorded" with no error to explain it.
    state.tables.outreach_uploads = [uploadRow("up1", "2026-07-27T09:00:00.000Z")];
    state.tables.outreach_prospects = [prospectRow("1", "up1")];

    await latestSnapshot(CLIENT);

    const selected = state.selectColumns.join(" ");
    for (const column of [
      "full_name",
      "title",
      "company",
      "icp_seg",
      "why_they_fit",
      "what_they_lack",
      "what_arcbound_offers",
      "matching_client_archetype",
      "linkedin_url",
      "location",
      "source_citation",
      "rationale",
      "linkedin_message",
      "connection_status",
      "date_sent",
      "reply_status",
      "follow_up_count",
      "last_follow_up_date",
      "next_touch_date",
      "meeting_booked_date",
      "stage",
      "owner",
      "notes",
      "qualified_icp",
      "email_best_email",
      "email_mobile",
      "email_subject_line",
      "email_message",
      "email_status",
      "email_date_emailed",
      "email_reply_status",
      "email_follow_up_count",
      "email_last_follow_up_date",
      "email_next_touch_date",
      "email_webinar_registered",
      "email_meeting_booked_date",
      "email_stage",
      "email_owner",
      "email_notes",
    ]) {
      expect(selected, `${column} must be selected`).toContain(column);
    }
  });

  it("maps every one of the 15 new email_* columns snake→camel", async () => {
    state.tables.outreach_uploads = [uploadRow("up1", "2026-07-27T09:00:00.000Z")];
    state.tables.outreach_prospects = [prospectRow("1", "up1")];

    const snapshot = await latestSnapshot(CLIENT);

    if (snapshot.status !== "ok") throw new Error("expected ok");
    const p = snapshot.prospects[0]!;
    expect(p.emailBestEmail).toBe("dana@northwind.io");
    expect(p.emailMobile).toBe("555-0100");
    expect(p.emailSubjectLine).toBe("Quick question about hiring");
    expect(p.emailMessage).toBe("Hi Dana - reaching out by email");
    expect(p.emailStatus).toBe("Drafted");
    expect(p.emailDateEmailed).toBe("2026-07-21");
    expect(p.emailReplyStatus).toBe("No reply");
    expect(p.emailFollowUpCount).toBe("0");
    expect(p.emailLastFollowUpDate).toBeNull();
    expect(p.emailNextTouchDate).toBeNull();
    expect(p.emailWebinarRegistered).toBe("No");
    expect(p.emailMeetingBookedDate).toBeNull();
    expect(p.emailStage).toBe("Drafted");
    expect(p.emailOwner).toBe("Bryan");
    expect(p.emailNotes).toBeNull();
  });
});

describe("PROSPECT_COLUMNS — the SELECT list and ProspectRow must never drift (S1)", () => {
  it("⚠️ requests every column ProspectRow expects — the structural guard `asPage` cannot provide", () => {
    // `asPage` ASSERTS the row type rather than checking it, so editing
    // `ProspectRow` without also editing `PROSPECT_COLUMNS` compiles cleanly and
    // returns `undefined` for a whole column on every row, with no error
    // anywhere — the exact failure this file's own comment warns about.
    //
    // This fixture is annotated `: ProspectRow`, so `pnpm type:check` fails on
    // the object literal below the moment a key is added to the interface and
    // NOT added here. Given that, this assertion is what closes the loop: if a
    // key is added to `ProspectRow` (and, forced by the above, to this fixture)
    // but forgotten in `PROSPECT_COLUMNS`, the sorted key sets stop matching and
    // this test goes red — a structural check, not fifteen hand-written
    // per-column assertions that a sixteenth column would slip past.
    const fixture: ProspectRow = {
      id: "1",
      outreach_upload_id: "up1",
      client_id: CLIENT,
      row_index: 0,
      full_name: null,
      title: null,
      company: null,
      icp_seg: null,
      why_they_fit: null,
      what_they_lack: null,
      what_arcbound_offers: null,
      matching_client_archetype: null,
      linkedin_url: null,
      location: null,
      source_citation: null,
      rationale: null,
      linkedin_message: null,
      connection_status: null,
      date_sent: null,
      reply_status: null,
      follow_up_count: null,
      last_follow_up_date: null,
      next_touch_date: null,
      meeting_booked_date: null,
      stage: null,
      owner: null,
      notes: null,
      qualified_icp: null,
      email_best_email: null,
      email_mobile: null,
      email_subject_line: null,
      email_message: null,
      email_status: null,
      email_date_emailed: null,
      email_reply_status: null,
      email_follow_up_count: null,
      email_last_follow_up_date: null,
      email_next_touch_date: null,
      email_webinar_registered: null,
      email_meeting_booked_date: null,
      email_stage: null,
      email_owner: null,
      email_notes: null,
    };

    expect(PROSPECT_COLUMNS.split(", ").sort()).toEqual(Object.keys(fixture).sort());
  });
});

describe("UPLOAD_COLUMNS — the SELECT list and UploadRow must never drift (S2)", () => {
  it("⚠️ requests every column UploadRow expects — the structural guard `asPage` cannot provide", () => {
    // Same failure `PROSPECT_COLUMNS` guards against: `asPage` ASSERTS the row
    // type rather than checking it, so editing `UploadRow` without also
    // editing `UPLOAD_COLUMNS` compiles cleanly and returns `undefined` for a
    // whole column on every row.
    //
    // This fixture is annotated `: UploadRow`, so `pnpm type:check` fails on
    // the object literal below the moment a key is added to the interface and
    // NOT added here — and this assertion is what closes the loop for
    // `PROSPECT_COLUMNS`'s reason: if a key is added to `UploadRow` (and,
    // forced by the above, to this fixture) but forgotten in
    // `UPLOAD_COLUMNS`, the sorted key sets stop matching and this test goes
    // red.
    const fixture: UploadRow = {
      id: "up1",
      client_id: CLIENT,
      row_count: 0,
      created_at: "2026-01-01T00:00:00.000Z",
      has_email_channel: false,
      // The three S1 void columns. Omitting any of them from `UPLOAD_COLUMNS`
      // would make `voidedAt` read `undefined` on every row — which
      // `latestSnapshot`'s query filter would not notice, and which the staff
      // history would render as "live" for a snapshot that is voided.
      uploaded_by: null,
      voided_at: null,
      voided_by: null,
    };

    expect(UPLOAD_COLUMNS.split(", ").sort()).toEqual(Object.keys(fixture).sort());
  });
});

describe("snapshotById — a NAMED snapshot, for comparison", () => {
  it("reads the snapshot ASKED FOR, not the newest one", async () => {
    // ⚠️ THE DISCRIMINATING CASE. `up2` is newer and holds two rows; `up1` holds
    // one. An implementation that quietly resolved "latest" would return two.
    state.tables.outreach_uploads = [
      uploadRow("up2", "2026-07-27T09:00:00.000Z"),
      uploadRow("up1", "2026-07-20T09:00:00.000Z"),
    ];
    state.tables.outreach_prospects = [
      prospectRow("1", "up2"),
      prospectRow("2", "up2", { row_index: 1 }),
      prospectRow("3", "up1", { full_name: "Sam Okafor" }),
    ];

    const snapshot = await snapshotById(CLIENT, "up1");

    if (snapshot.status !== "ok") throw new Error("expected ok");
    expect(snapshot.prospects).toHaveLength(1);
    expect(snapshot.prospects[0]!.fullName).toBe("Sam Okafor");
    expect(state.eqCalls).toContainEqual(["outreach_upload_id", "up1"]);
  });

  it("SCOPES BY CLIENT TOO, not by upload id alone", async () => {
    // Defence in depth: the upload id is a uuid the caller supplies, and a read
    // keyed on it alone would happily return another Client's prospects.
    state.tables.outreach_uploads = [uploadRow("up1", "2026-07-20T09:00:00.000Z")];
    state.tables.outreach_prospects = [prospectRow("1", "up1")];

    await snapshotById(CLIENT, "up1");

    expect(state.eqCalls).toContainEqual(["client_id", CLIENT]);
  });

  it("reports UNAVAILABLE when the read fails — never an ok with no rows", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    state.tables.outreach_prospects = [];
    state.errors.outreach_prospects = { message: "boom" };

    expect(await snapshotById(CLIENT, "up1")).toEqual({ status: "unavailable" });
    error.mockRestore();
  });

  it("returns an OK WITH NO ROWS when the snapshot genuinely carried none", async () => {
    // A real answer, not a failure: an upload of an empty file is a snapshot of
    // zero prospects, and it must not read as an outage.
    state.tables.outreach_prospects = [prospectRow("1", "up2")];

    const snapshot = await snapshotById(CLIENT, "up1");

    expect(snapshot.status).toBe("ok");
    if (snapshot.status !== "ok") throw new Error("unreachable");
    expect(snapshot.prospects).toEqual([]);
    expect(snapshot.truncated).toBe(false);
  });

  it("REPORTS truncation rather than returning a silently short snapshot", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.tables.outreach_prospects = Array.from({ length: MAX_PAGES * PAGE_SIZE + 1 }, (_, i) => ({
      id: `p${i}`,
      outreach_upload_id: "up1",
      client_id: CLIENT,
      row_index: i,
    }));

    const snapshot = await snapshotById(CLIENT, "up1");

    if (snapshot.status !== "ok") throw new Error("expected ok");
    // ⚠️ THE CALLER MUST NOT SUBTRACT A TRUNCATED COUNT FROM A WHOLE ONE. These
    // rows are a PREFIX, so every figure drawn from them is a floor — and a
    // floor minus a total manufactures movement that never happened.
    expect(snapshot.truncated).toBe(true);
    expect(snapshot.prospects.length).toBeLessThan(MAX_PAGES * PAGE_SIZE + 1);
    warn.mockRestore();
  });

  it("reads past the 1000-row response cap, like every other whole-table read", async () => {
    state.tables.outreach_prospects = Array.from({ length: 1435 }, (_, i) => ({
      id: `p${String(i).padStart(5, "0")}`,
      outreach_upload_id: "up1",
      client_id: CLIENT,
      row_index: i,
    }));

    const snapshot = await snapshotById(CLIENT, "up1");

    if (snapshot.status !== "ok") throw new Error("expected ok");
    expect(snapshot.prospects).toHaveLength(1435);
  });

  it("orders by a UNIQUE key so concurrent pages cannot overlap or skip", async () => {
    state.tables.outreach_prospects = [prospectRow("1", "up1")];

    await snapshotById(CLIENT, "up1");

    expect(state.orderCalls).toContainEqual(["id", { ascending: true }]);
  });
});
