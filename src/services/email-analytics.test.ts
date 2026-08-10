import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { OutreachProspect } from "@/services/types";

import { buildEmailAnalytics } from "./email-analytics";

// ─────────────────────────────────────────────────────────────────────────────
// PURE — no I/O, no clock. S2 (2026-08-03): the Email channel's own funnel,
// computed from ONE snapshot. A SEPARATE builder from `buildOutreachAnalytics`
// (D1) — the LinkedIn funnel and the Email funnel are two funnels, side by
// side, and this file's separateness from outreach-analytics.ts IS that
// decision: there is no shared object in which they could be summed by
// accident.
// ─────────────────────────────────────────────────────────────────────────────

let nextId = 0;
function prospect(over: Partial<OutreachProspect> = {}): OutreachProspect {
  nextId += 1;
  return {
    id: String(nextId),
    outreachUploadId: "up1",
    clientId: "c1",
    rowIndex: nextId,
    fullName: "Dana Reyes",
    title: null,
    company: null,
    icpSeg: null,
    whyTheyFit: null,
    whatTheyLack: null,
    whatArcboundOffers: null,
    matchingClientArchetype: null,
    linkedinUrl: "https://linkedin.com/in/dana",
    location: null,
    sourceCitation: null,
    rationale: null,
    linkedinMessage: null,
    connectionStatus: null,
    dateSent: null,
    replyStatus: null,
    followUpCount: null,
    lastFollowUpDate: null,
    nextTouchDate: null,
    meetingBookedDate: null,
    stage: null,
    owner: null,
    notes: null,
    qualifiedIcp: null,
    emailBestEmail: "dana@northwind.io",
    emailMobile: null,
    emailSubjectLine: null,
    emailMessage: null,
    emailStatus: "Drafted",
    emailDateEmailed: "2026-07-21",
    emailReplyStatus: "No reply",
    emailFollowUpCount: null,
    emailLastFollowUpDate: null,
    emailNextTouchDate: null,
    emailWebinarRegistered: "No",
    emailMeetingBookedDate: null,
    emailStage: "Drafted",
    emailOwner: null,
    emailNotes: null,
    ...over,
  };
}

const step = (
  a: Extract<ReturnType<typeof buildEmailAnalytics>, { status: "ok" }>,
  label: RegExp,
) => {
  const found = a.funnel.find((s) => label.test(s.label));
  if (!found) throw new Error(`no funnel step matching ${label}`);
  return found;
};

describe("buildEmailAnalytics — the discriminated union (D3)", () => {
  it("⚠️ hasEmailChannel: false returns not-in-export, EVEN WHEN ROWS CARRY EMAIL VALUES", () => {
    // ⚠️ THE FLAG DECIDES, NOT THE ROWS. A pre-S1 snapshot never has email
    // values, but the discriminating case is a snapshot that DOES carry them
    // and still has the flag false — proving the function reads the flag
    // rather than inferring "not in export" from empty columns.
    const rows = [prospect({ emailDateEmailed: "2026-07-21", emailReplyStatus: "Replied" })];

    expect(buildEmailAnalytics(rows, false)).toEqual({ status: "not-in-export" });
  });

  it("hasEmailChannel: true returns an OK funnel, even for an empty snapshot", () => {
    // A snapshot that genuinely carried no rows is a measurement, not an
    // outage — the funnel is real zeroes, not `not-in-export`.
    const result = buildEmailAnalytics([], true);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.funnel.every((s) => s.count === 0)).toBe(true);
    expect(result.combinedMeetings).toBe(0);
  });
});

describe("buildEmailAnalytics — the funnel is THREE steps, no acceptance gate", () => {
  it("has exactly three steps, sourced from the three Email columns", () => {
    const result = buildEmailAnalytics([prospect()], true);
    if (result.status !== "ok") throw new Error("expected ok");

    expect(result.funnel).toHaveLength(3);
    expect(result.funnel.map((s) => s.source)).toEqual([
      "Email — Date Emailed",
      "Email — Reply Status",
      "Email — Meeting Booked (date)",
    ]);
    for (const s of result.funnel) {
      expect(s.rule.length, s.label).toBeGreaterThan(0);
    }
  });

  it("counts SENT from Email — Date Emailed", () => {
    const rows = [
      prospect({ emailDateEmailed: "2026-07-21" }),
      prospect({ emailDateEmailed: null }),
      prospect({ emailDateEmailed: "  " }),
    ];
    const result = buildEmailAnalytics(rows, true);
    if (result.status !== "ok") throw new Error("expected ok");

    expect(step(result, /sent/i).count).toBe(1);
  });

  it("counts REPLIED from Email — Reply Status, excluding No reply and blank", () => {
    const rows = [
      prospect({ emailReplyStatus: "Replied - Positive" }),
      prospect({ emailReplyStatus: "No reply" }),
      prospect({ emailReplyStatus: null }),
      prospect({ emailReplyStatus: "   " }),
    ];
    const result = buildEmailAnalytics(rows, true);
    if (result.status !== "ok") throw new Error("expected ok");

    expect(step(result, /replied/i).count).toBe(1);
  });

  it("⚠️ a BLANK Email — Reply Status is never counted as a reply", () => {
    // The narrowest, most-scrutinised end of the funnel: a blank cell is
    // nobody writing anything down, not evidence of an unstated reply.
    const rows = [prospect({ emailReplyStatus: null }), prospect({ emailReplyStatus: "  " })];
    const result = buildEmailAnalytics(rows, true);
    if (result.status !== "ok") throw new Error("expected ok");

    expect(step(result, /replied/i).count).toBe(0);
  });

  it("DOES count an UNRECOGNISED reply status as a reply, and discloses it", () => {
    const rows = [prospect({ emailReplyStatus: "Not Interested" })];
    const result = buildEmailAnalytics(rows, true);
    if (result.status !== "ok") throw new Error("expected ok");

    expect(step(result, /replied/i).count).toBe(1);
    expect(result.unrecognisedReplyValues).toEqual(["Not Interested"]);
  });

  it("lists unrecognised Email — Reply Status values verbatim, de-duplicated", () => {
    const rows = [
      prospect({ emailReplyStatus: "Ghosted" }),
      prospect({ emailReplyStatus: "Ghosted" }),
      prospect({ emailReplyStatus: "Not Interested" }),
    ];
    const result = buildEmailAnalytics(rows, true);
    if (result.status !== "ok") throw new Error("expected ok");

    expect(result.unrecognisedReplyValues.sort()).toEqual(["Ghosted", "Not Interested"]);
  });

  it("counts MEETINGS from Email — Meeting Booked (date)", () => {
    const rows = [
      prospect({ emailMeetingBookedDate: "2026-07-27" }),
      prospect({ emailMeetingBookedDate: null }),
    ];
    const result = buildEmailAnalytics(rows, true);
    if (result.status !== "ok") throw new Error("expected ok");

    expect(step(result, /meeting/i).count).toBe(1);
  });

  it("⚠️ NEVER derives any count from Email — Status (D2 — the field is stale)", () => {
    // `Email — Status` reads 'Drafted' on 625 rows that also carry a send
    // date, and only 4 rows anywhere read 'Sent'. Arcbound confirmed the send
    // date is the real signal and the status column is simply not maintained.
    const rows = [
      // Status says "Sent" but there is no send date: must NOT count as sent.
      prospect({ emailStatus: "Sent", emailDateEmailed: null }),
      // Status says "Drafted" but a send date IS recorded: must count as sent.
      prospect({ emailStatus: "Drafted", emailDateEmailed: "2026-07-21" }),
    ];
    const result = buildEmailAnalytics(rows, true);
    if (result.status !== "ok") throw new Error("expected ok");

    expect(step(result, /sent/i).count).toBe(1);
  });

  it("⚠️ the source text never references emailStatus — forbidding the D2 violation outright", () => {
    // A behavioural test can be satisfied by coincidence; this closes the gap
    // by forbidding the reference itself, so a future edit that reads
    // `p.emailStatus` anywhere in this file fails here even if some fixture
    // happens not to expose it.
    const source = readFileSync(
      join(process.cwd(), "src", "services", "email-analytics.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/emailStatus/);
  });
});

describe("buildEmailAnalytics — combined meetings is a UNION, computed as one (D1)", () => {
  it("counts a prospect booked in EITHER column once", () => {
    const rows = [
      prospect({ meetingBookedDate: "2026-07-18", emailMeetingBookedDate: null }),
      prospect({ meetingBookedDate: null, emailMeetingBookedDate: "2026-07-19" }),
    ];
    const result = buildEmailAnalytics(rows, true);
    if (result.status !== "ok") throw new Error("expected ok");

    expect(result.combinedMeetings).toBe(2);
  });

  it("⚠️ counts a prospect booked in BOTH columns ONCE, never twice — the invariant a sum would violate", () => {
    const rows = [
      prospect({ meetingBookedDate: "2026-07-18", emailMeetingBookedDate: "2026-07-19" }),
    ];
    const result = buildEmailAnalytics(rows, true);
    if (result.status !== "ok") throw new Error("expected ok");

    expect(result.combinedMeetings).toBe(1);
    // A sum of the two funnels' bottom steps would read 2 here, not 1 — this
    // is exactly the 8-row overstatement D1 forbids, in miniature.
    expect(result.combinedMeetings).not.toBe(2);
  });

  it("the real-scale shape: 6 LinkedIn-only + 5 email-only + 8 both = union 19, not sum 27", () => {
    const rows = [
      ...Array.from({ length: 6 }, () =>
        prospect({ meetingBookedDate: "2026-07-01", emailMeetingBookedDate: null }),
      ),
      ...Array.from({ length: 5 }, () =>
        prospect({ meetingBookedDate: null, emailMeetingBookedDate: "2026-07-01" }),
      ),
      ...Array.from({ length: 8 }, () =>
        prospect({ meetingBookedDate: "2026-07-01", emailMeetingBookedDate: "2026-07-01" }),
      ),
    ];
    const result = buildEmailAnalytics(rows, true);
    if (result.status !== "ok") throw new Error("expected ok");

    expect(result.combinedMeetings).toBe(19);
    expect(result.combinedMeetings).not.toBe(27);
  });
});

describe("buildEmailAnalytics — sentWithoutAddress is a disclosure, never a filter (D2)", () => {
  it("counts rows with a send date and no Email — Best Email", () => {
    const rows = [
      prospect({ emailDateEmailed: "2026-07-21", emailBestEmail: null }),
      prospect({ emailDateEmailed: "2026-07-21", emailBestEmail: "dana@northwind.io" }),
    ];
    const result = buildEmailAnalytics(rows, true);
    if (result.status !== "ok") throw new Error("expected ok");

    expect(result.sentWithoutAddress).toBe(1);
  });

  it("⚠️ a row with no address STILL counts as SENT in the funnel — disclosure, not a filter", () => {
    const rows = [prospect({ emailDateEmailed: "2026-07-21", emailBestEmail: null })];
    const result = buildEmailAnalytics(rows, true);
    if (result.status !== "ok") throw new Error("expected ok");

    expect(step(result, /sent/i).count).toBe(1);
    expect(result.sentWithoutAddress).toBe(1);
  });

  it("does not count a row with no send date, even without an address", () => {
    const rows = [prospect({ emailDateEmailed: null, emailBestEmail: null })];
    const result = buildEmailAnalytics(rows, true);
    if (result.status !== "ok") throw new Error("expected ok");

    expect(result.sentWithoutAddress).toBe(0);
  });
});

describe("buildEmailAnalytics — stripped reply qualifiers are disclosed verbatim (D6)", () => {
  it("collects a qualifier stripped while bucketing Email — Reply Status", () => {
    const rows = [prospect({ emailReplyStatus: "Replied - Positive (booked 2026-07-27)" })];
    const result = buildEmailAnalytics(rows, true);
    if (result.status !== "ok") throw new Error("expected ok");

    expect(result.strippedQualifiers).toEqual(["booked 2026-07-27"]);
  });

  it("de-duplicates repeated qualifiers", () => {
    const rows = [
      prospect({ emailReplyStatus: "Replied - Positive (booked 2026-07-27)" }),
      prospect({ emailReplyStatus: "Replied - Neutral (booked 2026-07-27)" }),
    ];
    const result = buildEmailAnalytics(rows, true);
    if (result.status !== "ok") throw new Error("expected ok");

    expect(result.strippedQualifiers).toEqual(["booked 2026-07-27"]);
  });

  it("is empty when nothing carries a qualifier", () => {
    const rows = [prospect({ emailReplyStatus: "Replied - Positive" })];
    const result = buildEmailAnalytics(rows, true);
    if (result.status !== "ok") throw new Error("expected ok");

    expect(result.strippedQualifiers).toEqual([]);
  });

  it("lands the declined-with-date row on replied-unspecified, not negative — order is load-bearing", () => {
    const rows = [prospect({ emailReplyStatus: "Replied 2026-07-30 (declined)" })];
    const result = buildEmailAnalytics(rows, true);
    if (result.status !== "ok") throw new Error("expected ok");

    // Still counted as a reply either way — this pins the qualifier text, not
    // the funnel count.
    expect(result.strippedQualifiers).toEqual(["declined"]);
    expect(step(result, /replied/i).count).toBe(1);
  });
});

describe("buildEmailAnalytics — NO RATES, SCORES OR RANKINGS", () => {
  it("exposes no percentage, rate, score, rank or benchmark field", () => {
    const result = buildEmailAnalytics([prospect()], true);
    if (result.status !== "ok") throw new Error("expected ok");

    expect(Object.keys(result).sort()).toEqual(
      [
        "status",
        "funnel",
        "combinedMeetings",
        "sentWithoutAddress",
        "unrecognisedReplyValues",
        "strippedQualifiers",
      ].sort(),
    );
  });

  it("gives each funnel step only a count, source and rule — never a rate alongside it", () => {
    const result = buildEmailAnalytics([prospect()], true);
    if (result.status !== "ok") throw new Error("expected ok");

    for (const s of result.funnel) {
      expect(Object.keys(s).sort()).toEqual(["count", "label", "rule", "source"]);
    }
  });

  it("carries no score, grade, rate, or ranking word anywhere in the shape", () => {
    const banned = /\brate|percent|pct|\bshare\b|growth|score|rank|grade|benchmark|target|goal/i;
    const result = buildEmailAnalytics([prospect()], true);

    const keys: string[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (value === null || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        keys.push(key);
        walk(child);
      }
    };
    walk(result);

    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((k) => banned.test(k))).toEqual([]);
  });
});

describe("buildEmailAnalytics — purity", () => {
  it("does not mutate its input", () => {
    const rows = [prospect()];
    const before = JSON.parse(JSON.stringify(rows));

    buildEmailAnalytics(rows, true);

    expect(rows).toEqual(before);
  });

  it("is deterministic — the same input always gives the same result", () => {
    const rows = [prospect({ emailReplyStatus: "Replied - Positive" })];

    expect(buildEmailAnalytics(rows, true)).toEqual(buildEmailAnalytics(rows, true));
  });
});
