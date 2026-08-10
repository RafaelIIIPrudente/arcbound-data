import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { OutreachProspect } from "@/services/types";

import {
  buildOutreachAnalytics,
  fillSentMonths,
  outreachMovement,
  sentTrend,
} from "./outreach-analytics";

// ─────────────────────────────────────────────────────────────────────────────
// PURE — no I/O, no clock. Every fixture below is shaped from the REAL observed
// snapshot (spec, 2026-07-27, 1,435 rows): the same vocabularies, the same
// dirt, the same proportions in miniature.
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
    title: "VP Engineering",
    company: "Northwind",
    icpSeg: "Series B SaaS",
    whyTheyFit: "hiring",
    whatTheyLack: null,
    whatArcboundOffers: null,
    matchingClientArchetype: "Founder / CEO / investor",
    linkedinUrl: "https://linkedin.com/in/dana",
    location: "Austin, TX",
    sourceCitation: "TechCrunch",
    rationale: "scaling",
    linkedinMessage: null,
    connectionStatus: "Pending",
    dateSent: "2026-07-20",
    replyStatus: "No Reply",
    followUpCount: "0",
    lastFollowUpDate: null,
    nextTouchDate: null,
    meetingBookedDate: null,
    stage: "Requested",
    owner: "Bryan",
    notes: null,
    qualifiedIcp: "Yes",
    emailBestEmail: null,
    emailMobile: null,
    emailSubjectLine: null,
    emailMessage: null,
    emailStatus: null,
    emailDateEmailed: null,
    emailReplyStatus: null,
    emailFollowUpCount: null,
    emailLastFollowUpDate: null,
    emailNextTouchDate: null,
    emailWebinarRegistered: null,
    emailMeetingBookedDate: null,
    emailStage: null,
    emailOwner: null,
    emailNotes: null,
    ...over,
  };
}

const step = (a: ReturnType<typeof buildOutreachAnalytics>, label: RegExp) => {
  const found = a.funnel.find((s) => label.test(s.label));
  if (!found) throw new Error(`no funnel step matching ${label}`);
  return found;
};

describe("buildOutreachAnalytics — totals", () => {
  it("counts every prospect in the snapshot", () => {
    expect(buildOutreachAnalytics([prospect(), prospect(), prospect()]).totalProspects).toBe(3);
  });

  it("returns honest zeroes for an EMPTY snapshot rather than throwing", () => {
    // A snapshot that genuinely carried no rows is a measurement. The
    // could-not-read case never reaches this function — the route handles it.
    const a = buildOutreachAnalytics([]);

    expect(a.totalProspects).toBe(0);
    expect(a.funnel.every((s) => s.count === 0)).toBe(true);
    expect(a.stage).toEqual([]);
    expect(a.sentDateRange).toBeNull();
  });
});

describe("buildOutreachAnalytics — THE FUNNEL IS NOT DERIVED FROM STAGE", () => {
  // ⚠️ THE SINGLE MOST IMPORTANT PROPERTY ON THIS PAGE. `Stage` records the
  // FURTHEST point a prospect reached, so its counts are TERMINAL: "Requested
  // 1,216" means 1,216 are STILL at Requested, not that 1,216 were ever sent.
  // Stacking those into a funnel would draw a shape the data does not describe.
  // Each step below is therefore counted from the one column that defines it.
  it("counts SENT from Date Sent, not from Stage", () => {
    // ⚠️ THE FIXTURE IS BUILT SO THE TWO ANSWERS CANNOT COINCIDE. An earlier
    // version had Sent and Stage-"Requested" both equal to 2, so a funnel wired
    // to Stage would have passed it. Here Sent is 2 and Stage-"Requested" is 1.
    const rows = [
      // Reached the end of the pipeline — Stage says "Client", but a request was
      // still sent, so this row belongs in Sent.
      prospect({ stage: "Client", dateSent: "2026-07-01" }),
      prospect({ stage: "Meeting Booked", dateSent: "2026-07-02" }),
      // Stage says Requested but no date was ever recorded: NOT sent.
      prospect({ stage: "Requested", dateSent: null }),
    ];
    const a = buildOutreachAnalytics(rows);

    expect(step(a, /sent/i).count).toBe(2);
    // Only ONE row sits at Stage "Requested" — a different number from Sent, and
    // that difference is what makes this test discriminating.
    expect(a.stage.find((s) => s.label === "Requested")?.count).toBe(1);
    expect(step(a, /sent/i).count).not.toBe(a.stage.find((s) => s.label === "Requested")?.count);
  });

  it("counts CONNECTED from Connection Status, not from the Stage named Connected", () => {
    // ⚠️ THE TWO COLUMNS SHARE A WORD AND MEAN DIFFERENT THINGS. In the real
    // snapshot 217 are accepted (Connection Status) while only 177 sit at Stage
    // "Connected" — the other 40 moved further along and Stage stopped counting
    // them. Reading the funnel off Stage would lose those 40.
    const rows = [
      prospect({ connectionStatus: "Connected", stage: "Connected" }),
      prospect({ connectionStatus: "Connected", stage: "Meeting Booked" }),
      prospect({ connectionStatus: "Connected", stage: "Replied" }),
      prospect({ connectionStatus: "Pending", stage: "Requested" }),
    ];
    const a = buildOutreachAnalytics(rows);

    expect(step(a, /connections accepted/i).count).toBe(3);
    expect(a.stage.find((s) => s.label === "Connected")?.count).toBe(1);
    // If the funnel were read off Stage this would be 1, not 3.
    expect(step(a, /connections accepted/i).count).not.toBe(
      a.stage.find((s) => s.label === "Connected")?.count,
    );
  });

  it("counts REPLIED from Reply Status, and DISAGREES with Stage 'Replied' by design", () => {
    // The real snapshot: Stage-Replied is 25, reply-status replies are 39. They
    // answer different questions and must never be reconciled or averaged.
    const rows = [
      prospect({ replyStatus: "Replied - Positive", stage: "Meeting Booked" }),
      prospect({ replyStatus: "Replied", stage: "Replied" }),
      prospect({ replyStatus: "Replied 2026-07-13", stage: "Client" }),
      prospect({ replyStatus: "No Reply", stage: "Requested" }),
    ];
    const a = buildOutreachAnalytics(rows);

    expect(step(a, /replied/i).count).toBe(3);
    expect(a.stage.find((s) => s.label === "Replied")?.count).toBe(1);
  });

  it("counts MEETINGS from Meeting Booked (date), not from Stage 'Meeting Booked'", () => {
    // Built so the two answers differ: 2 rows carry a meeting date, but only 1
    // sits at Stage "Meeting Booked".
    const rows = [
      prospect({ meetingBookedDate: "2026-07-18", stage: "Client" }),
      prospect({ meetingBookedDate: "2026-07-19", stage: "Client" }),
      // Stage claims a meeting but no date was recorded — the date column is the
      // one that defines this step, so this row is not counted.
      prospect({ meetingBookedDate: null, stage: "Meeting Booked" }),
    ];
    const a = buildOutreachAnalytics(rows);

    expect(step(a, /meeting/i).count).toBe(2);
    expect(a.stage.find((s) => s.label === "Meeting Booked")?.count).toBe(1);
    expect(step(a, /meeting/i).count).not.toBe(
      a.stage.find((s) => s.label === "Meeting Booked")?.count,
    );
  });

  it("NAMES THE SOURCE COLUMN AND THE RULE on every step", () => {
    // ⚠️ WITHOUT THIS THE PAGE LIES BY OMISSION. Two of these steps disagree
    // with the Stage breakdown beside them; a reader who cannot see which column
    // produced which number will treat the gap as a bug.
    const a = buildOutreachAnalytics([prospect()]);

    expect(a.funnel).toHaveLength(4);
    expect(a.funnel.map((s) => s.source)).toEqual([
      "Date Sent",
      "Connection Status",
      "Reply Status",
      "Meeting Booked (date)",
    ]);
    for (const s of a.funnel) {
      expect(s.rule.length, s.label).toBeGreaterThan(0);
      // No step may claim Stage as its source.
      expect(s.source).not.toBe("Stage");
    }
  });

  it("is ordered widest-first and never re-sorted by count", () => {
    // A funnel whose steps reorder themselves would stop being a funnel.
    const a = buildOutreachAnalytics([
      prospect({ dateSent: null, connectionStatus: "Connected", meetingBookedDate: "2026-07-01" }),
    ]);

    expect(a.funnel.map((s) => s.source)).toEqual([
      "Date Sent",
      "Connection Status",
      "Reply Status",
      "Meeting Booked (date)",
    ]);
  });
});

describe("buildOutreachAnalytics — the Replied step and absent statuses", () => {
  it("does NOT count a BLANK reply status as a reply", () => {
    // ⚠️ "not No Reply" IS NOT THE SAME TEST AS "replied". A blank cell is
    // nobody writing anything down; counting it as a reply would inflate the
    // narrowest, most scrutinised end of the funnel with rows that carry no
    // evidence at all. Reply Status is 100% filled today — which is exactly why
    // this would go unnoticed if it were wrong.
    const rows = [prospect({ replyStatus: null }), prospect({ replyStatus: "  " })];

    expect(step(buildOutreachAnalytics(rows), /replied/i).count).toBe(0);
  });

  it("DOES count an UNRECOGNISED status as a reply, and discloses it", () => {
    // "Not Interested" is not "No Reply", so somebody responded. What that
    // response meant is unknown — which is why it also appears verbatim in the
    // disclosure list rather than being filed under a sentiment.
    const rows = [prospect({ replyStatus: "Not Interested" })];
    const a = buildOutreachAnalytics(rows);

    expect(step(a, /replied/i).count).toBe(1);
    expect(a.unrecognisedReplyValues).toEqual(["Not Interested"]);
  });
});

describe("buildOutreachAnalytics — breakdowns", () => {
  it("groups connection status by its raw values", () => {
    const rows = [
      prospect({ connectionStatus: "Pending" }),
      prospect({ connectionStatus: "Pending" }),
      prospect({ connectionStatus: "Connected" }),
    ];

    expect(buildOutreachAnalytics(rows).connectionStatus).toEqual([
      { label: "Pending", count: 2 },
      { label: "Connected", count: 1 },
    ]);
  });

  it("groups reply status by canonical BUCKET, folding the dated variants together", () => {
    // The eight date-bearing variants are one status, not eight.
    const rows = [
      prospect({ replyStatus: "Replied 2026-07-13" }),
      prospect({ replyStatus: "Replied 2026-07-14" }),
      prospect({ replyStatus: "Replied" }),
      prospect({ replyStatus: "No Reply" }),
    ];
    const a = buildOutreachAnalytics(rows);

    const unspecified = a.replyStatus.find((r) => /sentiment not stated/i.test(r.label));
    expect(unspecified?.count).toBe(3);
    expect(a.replyStatus.find((r) => /no reply/i.test(r.label))?.count).toBe(1);
  });

  it("keeps every stage under its OWN name — the three Closed stages stay three", () => {
    const rows = [
      prospect({ stage: "Closed - Low Fit" }),
      prospect({ stage: "Closed - Disqualified" }),
      prospect({ stage: "Closed - Rejected" }),
    ];
    const a = buildOutreachAnalytics(rows);

    expect(a.stage.map((s) => s.label).sort()).toEqual([
      "Closed - Disqualified",
      "Closed - Low Fit",
      "Closed - Rejected",
    ]);
  });

  it("keeps two DIFFERENT unknown stages apart instead of merging them", () => {
    // ⚠️ THE FAILURE MODE OF A NAIVE "unrecognised" LABEL. If canonicalStage
    // returned the word "unrecognised" these two would share one bar and their
    // counts would be added together — bucketing away, disguised as disclosure.
    const rows = [
      prospect({ stage: "Nurturing" }),
      prospect({ stage: "Nurturing" }),
      prospect({ stage: "Warm Lead" }),
    ];
    const a = buildOutreachAnalytics(rows);

    expect(a.stage.find((s) => s.label === "Nurturing")?.count).toBe(2);
    expect(a.stage.find((s) => s.label === "Warm Lead")?.count).toBe(1);
    expect(a.unrecognisedStageValues.sort()).toEqual(["Nurturing", "Warm Lead"]);
  });

  it("orders breakdowns by count, largest first", () => {
    const rows = [
      prospect({ stage: "Connected" }),
      prospect({ stage: "Requested" }),
      prospect({ stage: "Requested" }),
    ];

    expect(buildOutreachAnalytics(rows).stage.map((s) => s.label)).toEqual([
      "Requested",
      "Connected",
    ]);
  });
});

describe("buildOutreachAnalytics — nothing is bucketed into 'other'", () => {
  it("lists unrecognised REPLY values verbatim, de-duplicated", () => {
    const rows = [
      prospect({ replyStatus: "Replied - Interested" }),
      prospect({ replyStatus: "Replied - Interested" }),
      prospect({ replyStatus: "Not Interested" }),
    ];

    expect(buildOutreachAnalytics(rows).unrecognisedReplyValues.sort()).toEqual([
      "Not Interested",
      "Replied - Interested",
    ]);
  });

  it("never invents an 'Other' bucket in any breakdown", () => {
    const rows = [prospect({ stage: "Nurturing", replyStatus: "Ghosted" })];
    const a = buildOutreachAnalytics(rows);
    const labels = [...a.stage, ...a.replyStatus, ...a.connectionStatus].map((r) =>
      r.label.toLowerCase(),
    );

    expect(labels).not.toContain("other");
    expect(labels).not.toContain("misc");
  });

  it("does NOT list a BLANK stage as an unrecognised value", () => {
    // There is no string to print; an empty label names nothing on screen.
    const a = buildOutreachAnalytics([prospect({ stage: null }), prospect({ stage: "  " })]);

    expect(a.unrecognisedStageValues).toEqual([]);
  });
});

describe("buildOutreachAnalytics — A3: the qualifier disclosure REGRESSION S2 introduced (2026-08-10)", () => {
  // ⚠️ S2 taught `canonicalReply` to strip a trailing parenthetical qualifier
  // on BOTH channels (D6), but only wired the disclosure into the Email
  // builder. These two exact values — measured in the real export — used to
  // reach `unrecognisedReplyValues` verbatim because `canonicalReply` could
  // not read them; S2 made them bucket silently, and the qualifier vanished.
  // This is the whole point of the A3 repair.
  it("⚠️ 'Replied - Positive (via email; meeting canceled)' buckets Positive AND surfaces the qualifier — the case the rule exists for", () => {
    const rows = [prospect({ replyStatus: "Replied - Positive (via email; meeting canceled)" })];
    const a = buildOutreachAnalytics(rows);

    // The funnel count is unaffected — this value already counted as replied
    // before S2, via `unrecognised`, and still counts as replied now.
    expect(step(a, /replied/i).count).toBe(1);
    expect(a.replyStatus.find((r) => /positive/i.test(r.label))?.count).toBe(1);
    expect(a.strippedReplyQualifiers).toEqual(["via email; meeting canceled"]);
  });

  it("'Replied 2026-07-30 (declined)' buckets replied-unspecified AND surfaces 'declined'", () => {
    const rows = [prospect({ replyStatus: "Replied 2026-07-30 (declined)" })];
    const a = buildOutreachAnalytics(rows);

    expect(step(a, /replied/i).count).toBe(1);
    const unspecified = a.replyStatus.find((r) => /sentiment not stated/i.test(r.label));
    expect(unspecified?.count).toBe(1);
    expect(a.strippedReplyQualifiers).toEqual(["declined"]);
  });

  it("is empty when no reply status carries a trailing qualifier", () => {
    const rows = [
      prospect({ replyStatus: "Replied - Positive" }),
      prospect({ replyStatus: "No Reply" }),
    ];

    expect(buildOutreachAnalytics(rows).strippedReplyQualifiers).toEqual([]);
  });

  it("de-duplicates a repeated qualifier, verbatim and first-seen order", () => {
    const rows = [
      prospect({ replyStatus: "Replied - Positive (booked 2026-07-27)" }),
      prospect({ replyStatus: "Replied - Neutral (booked 2026-07-27)" }),
      prospect({ replyStatus: "Replied 2026-07-30 (declined)" }),
    ];

    expect(buildOutreachAnalytics(rows).strippedReplyQualifiers).toEqual([
      "booked 2026-07-27",
      "declined",
    ]);
  });
});

describe("buildOutreachAnalytics — NO RATES, SCORES OR RANKINGS", () => {
  it("exposes no percentage, rate, score, rank or benchmark field", () => {
    // ⚠️ A WHITELIST, SO A DERIVED FIGURE CANNOT BE ADDED QUIETLY. Meetings
    // booked is ~8 of ~1,220: any rate computed here reads as a verdict the
    // sample cannot support.
    //
    // ⚠️ 2026-08-10 (A3): `strippedReplyQualifiers` was added KNOWINGLY, to
    // repair a disclosure regression S2 introduced — see the describe block
    // above. It is a list of verbatim strings, not a derived figure, and does
    // not weaken this whitelist's purpose.
    const a = buildOutreachAnalytics([prospect()]);

    expect(Object.keys(a).sort()).toEqual(
      [
        "connectionStatus",
        "followUps",
        "funnel",
        "replyStatus",
        "sentDateRange",
        "sentOverTime",
        "stage",
        "strippedReplyQualifiers",
        "totalProspects",
        "undatedSent",
        "unreadableFollowUpCounts",
        "unreadableSentValues",
        "unrecognisedReplyValues",
        "unrecognisedStageValues",
      ].sort(),
    );
  });

  it("gives each funnel step only a count — never a rate alongside it", () => {
    const a = buildOutreachAnalytics([prospect()]);

    for (const s of a.funnel) {
      expect(Object.keys(s).sort()).toEqual(["count", "label", "rule", "source"]);
    }
  });
});

describe("buildOutreachAnalytics — Date Sent, including the 2020 outlier", () => {
  it("KEEPS the 2020-12-04 outlier in the series rather than filtering it", () => {
    // ⚠️ THE STATED RULE: NOTHING IS FILTERED. One row sits at 2020-12-04
    // against an otherwise-2026 range. Every cutoff that would remove it is a
    // judgement the data does not support, so it stays — and `sentDateRange`
    // publishes it so a reader meets it immediately instead of never learning
    // it existed. Silent filtering is the one option not available.
    const rows = [
      prospect({ dateSent: "2020-12-04" }),
      prospect({ dateSent: "2026-07-20" }),
      prospect({ dateSent: "2026-07-23" }),
    ];
    const a = buildOutreachAnalytics(rows);

    expect(a.sentOverTime).toContainEqual({ date: "2020-12", count: 1 });
    expect(a.sentOverTime.reduce((n, b) => n + b.count, 0)).toBe(3);
  });

  it("PUBLISHES the range so the outlier is visible without a chart", () => {
    const rows = [
      prospect({ dateSent: "2026-07-20" }),
      prospect({ dateSent: "2020-12-04" }),
      prospect({ dateSent: "2026-07-23" }),
    ];

    expect(buildOutreachAnalytics(rows).sentDateRange).toEqual({
      earliest: "2020-12-04",
      latest: "2026-07-23",
    });
  });

  it("buckets by calendar month, ascending", () => {
    const rows = [
      prospect({ dateSent: "2026-07-23" }),
      prospect({ dateSent: "2026-06-01" }),
      prospect({ dateSent: "2026-07-02" }),
    ];

    expect(buildOutreachAnalytics(rows).sentOverTime).toEqual([
      { date: "2026-06", count: 1 },
      { date: "2026-07", count: 2 },
    ]);
  });

  it("counts UNDATED rows and excludes them from the series", () => {
    const rows = [prospect({ dateSent: null }), prospect({ dateSent: "   " }), prospect()];
    const a = buildOutreachAnalytics(rows);

    expect(a.undatedSent).toBe(2);
    expect(a.sentOverTime.reduce((n, b) => n + b.count, 0)).toBe(1);
  });

  it("keeps UNREADABLE apart from UNDATED, and discloses it verbatim", () => {
    // Two different facts: nobody recorded a date, versus somebody recorded
    // something that is not one. Merging them would hide a data-quality problem
    // inside a number that looks routine.
    const rows = [prospect({ dateSent: null }), prospect({ dateSent: "last tuesday" })];
    const a = buildOutreachAnalytics(rows);

    expect(a.undatedSent).toBe(1);
    expect(a.unreadableSentValues).toEqual(["last tuesday"]);
    expect(a.sentOverTime).toEqual([]);
  });

  it("does not let an unreadable date reach the range", () => {
    const rows = [prospect({ dateSent: "last tuesday" }), prospect({ dateSent: "2026-07-20" })];

    expect(buildOutreachAnalytics(rows).sentDateRange).toEqual({
      earliest: "2026-07-20",
      latest: "2026-07-20",
    });
  });
});

describe("buildOutreachAnalytics — Follow-up Count is TEXT", () => {
  it("groups the readable counts", () => {
    const rows = [
      prospect({ followUpCount: "0" }),
      prospect({ followUpCount: "0" }),
      prospect({ followUpCount: "1" }),
      prospect({ followUpCount: "2" }),
    ];

    expect(buildOutreachAnalytics(rows).followUps).toEqual([
      { label: "0", count: 2 },
      { label: "1", count: 1 },
      { label: "2", count: 1 },
    ]);
  });

  it("keeps an UNREADABLE count out of the '0' bucket, in a bar of its own", () => {
    // ⚠️ THE FOUR-STATE RULE AT ITS SHARPEST. "0" is 1,320 of 1,435 rows, so an
    // unreadable cell folded into it would be invisible forever. It is not
    // dropped either: it gets its own named bar, so the chart still accounts for
    // every prospect.
    const rows = [
      prospect({ followUpCount: "0" }),
      prospect({ followUpCount: "n/a" }),
      prospect({ followUpCount: null }),
    ];
    const a = buildOutreachAnalytics(rows);

    expect(a.followUps).toEqual([
      { label: "0", count: 1 },
      { label: "Count could not be read", count: 2 },
    ]);
    expect(a.unreadableFollowUpCounts).toBe(2);
  });

  it("pins the unreadable bar LAST, deterministically", () => {
    // `Number("Count could not be read")` is NaN and every NaN comparison is
    // false, so a naive numeric sort would leave this bar's position dependent
    // on insertion order.
    const rows = [
      prospect({ followUpCount: "n/a" }),
      prospect({ followUpCount: "2" }),
      prospect({ followUpCount: "0" }),
    ];

    expect(buildOutreachAnalytics(rows).followUps.map((f) => f.label)).toEqual([
      "0",
      "2",
      "Count could not be read",
    ]);
  });
});

describe("buildOutreachAnalytics — EVERY BREAKDOWN ACCOUNTS FOR EVERY PROSPECT", () => {
  // ⚠️ THE INVARIANT THAT WOULD HAVE CAUGHT THE WORST BUG IN THIS FILE.
  //
  // The first version mapped a blank Stage to null and dropped it in `tally`, so
  // the Stage chart rendered bars summing to LESS than the caption's denominator
  // with nothing on the page accounting for the difference. That is the
  // four-state failure in its quietest form — not an absent value shown as 0,
  // but an absent value shown as NOTHING, beneath a heading claiming it had been
  // counted. Every chart on this page is captioned with the prospect total, so
  // every chart must sum to it.
  const sum = (rows: { count: number }[]) => rows.reduce((n, r) => n + r.count, 0);

  it("holds for a snapshot with BLANK values in every categorical column", () => {
    const rows = [
      prospect(),
      prospect({ stage: null, connectionStatus: null, replyStatus: null, followUpCount: null }),
      prospect({ stage: "  ", connectionStatus: "   ", replyStatus: "  ", followUpCount: "  " }),
      prospect({ stage: "Nurturing", replyStatus: "Ghosted", followUpCount: "n/a" }),
    ];
    const a = buildOutreachAnalytics(rows);

    expect(a.totalProspects).toBe(4);
    expect(sum(a.stage), "stage").toBe(4);
    expect(sum(a.connectionStatus), "connectionStatus").toBe(4);
    expect(sum(a.replyStatus), "replyStatus").toBe(4);
    expect(sum(a.followUps), "followUps").toBe(4);
  });

  it("NAMES the absence rather than dropping the row", () => {
    const a = buildOutreachAnalytics([prospect({ stage: null, connectionStatus: null })]);

    expect(a.stage).toEqual([{ label: "No stage recorded", count: 1 }]);
    expect(a.connectionStatus).toEqual([{ label: "No connection status recorded", count: 1 }]);
  });

  it("holds for the ordinary, fully-populated snapshot too", () => {
    const rows = [
      prospect({ stage: "Requested", connectionStatus: "Pending", replyStatus: "No Reply" }),
      prospect({ stage: "Connected", connectionStatus: "Connected", replyStatus: "Replied" }),
    ];
    const a = buildOutreachAnalytics(rows);

    for (const [name, breakdown] of [
      ["stage", a.stage],
      ["connectionStatus", a.connectionStatus],
      ["replyStatus", a.replyStatus],
      ["followUps", a.followUps],
    ] as const) {
      expect(sum(breakdown), name).toBe(a.totalProspects);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S5 — TRENDS. Two pure helpers over figures S3 already computes.
// ─────────────────────────────────────────────────────────────────────────────

describe("fillSentMonths — a month with no requests is a REAL zero", () => {
  it("fills a missing FEBRUARY between January and March", () => {
    const filled = fillSentMonths([
      { date: "2026-01", count: 4 },
      { date: "2026-03", count: 6 },
    ]);

    expect(filled).toEqual([
      { date: "2026-01", count: 4 },
      { date: "2026-02", count: 0 },
      { date: "2026-03", count: 6 },
    ]);
  });

  it("crosses a YEAR BOUNDARY without losing a month", () => {
    const filled = fillSentMonths([
      { date: "2025-11", count: 1 },
      { date: "2026-02", count: 2 },
    ]);

    expect(filled.map((m) => m.date)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("never trims an endpoint — the 2020 outlier survives the fill", () => {
    const filled = fillSentMonths([
      { date: "2020-12", count: 1 },
      { date: "2026-07", count: 9 },
    ]);

    expect(filled[0]).toEqual({ date: "2020-12", count: 1 });
    expect(filled[filled.length - 1]).toEqual({ date: "2026-07", count: 9 });
    // Dec 2020 → Jul 2026 inclusive.
    expect(filled).toHaveLength(68);
  });

  it("adds nothing to a series with no gaps, and handles the degenerate sizes", () => {
    expect(fillSentMonths([])).toEqual([]);
    expect(fillSentMonths([{ date: "2026-07", count: 3 }])).toEqual([
      { date: "2026-07", count: 3 },
    ]);
    const contiguous = [
      { date: "2026-06", count: 1 },
      { date: "2026-07", count: 2 },
    ];
    expect(fillSentMonths(contiguous)).toEqual(contiguous);
  });
});

describe("sentTrend — a long dormancy is COMPRESSED, never trimmed", () => {
  it("keeps a ONE-month gap as a visible zero bar, not a collapsed range", () => {
    const points = sentTrend([
      { date: "2026-01", count: 4 },
      { date: "2026-03", count: 6 },
    ]);

    expect(points.every((p) => p.kind === "month")).toBe(true);
    expect(points.map((p) => p.count)).toEqual([4, 0, 6]);
  });

  it("collapses a run of three or more empty months into ONE labelled gap", () => {
    const points = sentTrend([
      { date: "2026-01", count: 4 },
      { date: "2026-06", count: 6 },
    ]);

    expect(points).toHaveLength(3);
    expect(points[0]).toMatchObject({ kind: "month", date: "2026-01", count: 4 });
    expect(points[1]).toMatchObject({
      kind: "gap",
      months: 4,
      from: "2026-02",
      to: "2026-05",
    });
    expect(points[2]).toMatchObject({ kind: "month", date: "2026-06", count: 6 });
  });

  it("STATES the gap in words on the label a reader actually sees", () => {
    const gap = sentTrend([
      { date: "2020-12", count: 1 },
      { date: "2026-02", count: 5 },
    ]).find((p) => p.kind === "gap");

    // Dec 2020 → Feb 2026 is 63 months; the two endpoints carry requests, so 61
    // dormant months sit between them.
    expect(gap).toMatchObject({ months: 61, from: "2021-01", to: "2026-01" });
    expect(gap?.label).toMatch(/61 months/);
    expect(gap?.label).toMatch(/none sent/i);
  });

  it("gives a gap a NULL count — it is a collapsed range, not a measured month", () => {
    const gap = sentTrend([
      { date: "2026-01", count: 4 },
      { date: "2026-06", count: 6 },
    ]).find((p) => p.kind === "gap");

    expect(gap?.count).toBeNull();
    expect(gap?.count).not.toBe(0);
  });

  it("ACCOUNTS FOR EVERY MONTH IN THE SPAN — nothing is silently dropped", () => {
    const series = [
      { date: "2020-12", count: 1 },
      { date: "2026-02", count: 5 },
      { date: "2026-03", count: 7 },
      { date: "2026-07", count: 2 },
    ];
    const points = sentTrend(series);

    const covered = points.reduce((n, p) => n + (p.kind === "gap" ? p.months : 1), 0);
    expect(covered).toBe(fillSentMonths(series).length);

    // …and every REQUEST is still on the chart: a collapsed gap holds only zeros.
    const charted = points.reduce((n, p) => n + (p.kind === "month" ? p.count : 0), 0);
    expect(charted).toBe(series.reduce((n, m) => n + m.count, 0));
  });

  it("labels a month for a human without ever constructing a Date", () => {
    const points = sentTrend([{ date: "2026-07", count: 3 }]);
    expect(points[0]?.label).toBe("Jul 2026");
  });

  it("is empty for a snapshot where nothing carries a readable send date", () => {
    expect(sentTrend([])).toEqual([]);
  });
});

describe("outreachMovement — a DIFFERENCE OF TWO COUNTS, and nothing more", () => {
  // ⚠️ EVERY DELTA BELOW IS DISTINCT (+6, +5, +4, +3, +1). That is deliberate:
  // with two steps sharing a delta, a mis-paired zip would still produce the
  // expected numbers and the pairing would go untested.
  const previous = buildOutreachAnalytics([
    prospect({
      dateSent: "2026-06-01",
      connectionStatus: "Connected",
      replyStatus: "Replied - Positive",
      meetingBookedDate: "2026-06-10",
    }),
    prospect({ dateSent: "2026-06-02", connectionStatus: "Connected", replyStatus: "Replied" }),
    prospect({ dateSent: "2026-06-03", connectionStatus: "Connected", replyStatus: "No Reply" }),
    prospect({ dateSent: "2026-06-04", connectionStatus: "Pending", replyStatus: "No Reply" }),
  ]);

  const current = buildOutreachAnalytics([
    ...Array.from({ length: 2 }, () =>
      prospect({
        dateSent: "2026-07-01",
        connectionStatus: "Connected",
        replyStatus: "Replied - Positive",
        meetingBookedDate: "2026-07-10",
      }),
    ),
    ...Array.from({ length: 3 }, () =>
      prospect({ dateSent: "2026-07-02", connectionStatus: "Connected", replyStatus: "Replied" }),
    ),
    ...Array.from({ length: 2 }, () =>
      prospect({ dateSent: "2026-07-03", connectionStatus: "Connected", replyStatus: "No Reply" }),
    ),
    ...Array.from({ length: 2 }, () =>
      prospect({ dateSent: "2026-07-04", connectionStatus: "Pending", replyStatus: "No Reply" }),
    ),
    prospect({ dateSent: null, connectionStatus: "Pending", replyStatus: "No Reply" }),
  ]);

  it("reports previous, current and the difference for every funnel step", () => {
    const movement = outreachMovement(current, previous);

    expect(movement.steps.map((s) => [s.label, s.previous, s.current, s.delta])).toEqual([
      ["Requests sent", 4, 9, 5],
      ["Connections accepted", 3, 7, 4],
      ["Replied", 2, 5, 3],
      ["Meetings booked", 1, 2, 1],
    ]);
  });

  it("reports the PROSPECT-COUNT movement — the sheet's own size", () => {
    expect(outreachMovement(current, previous).prospects).toEqual({
      previous: 4,
      current: 10,
      delta: 6,
    });
  });

  it("STATES a negative delta as a negative number, with no verdict attached", () => {
    const movement = outreachMovement(previous, current);
    const sent = movement.steps[0]!;

    expect(sent.delta).toBe(-5);
    // ⚠️ NO JUDGEMENT FIELD ANYWHERE. A `direction`, `trend`, `improved` or
    // `severity` on this object would push the reading into the type, and every
    // component downstream would inherit a verdict the data cannot support: a
    // drop can mean the sheet shrank, not that anybody un-replied.
    expect(Object.keys(sent).sort()).toEqual(["current", "delta", "label", "previous", "source"]);
  });

  it("carries NO RATE, PERCENTAGE, GROWTH, SCORE OR RANK — anywhere in the shape", () => {
    const movement = outreachMovement(current, previous);
    const banned = /rate|percent|pct|share|growth|score|rank|grade|benchmark|target|goal/i;

    const keys: string[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (value === null || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        keys.push(key);
        walk(child);
      }
    };
    walk(movement);

    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((k) => banned.test(k))).toEqual([]);
    // Nor may a delta be expressed as a fraction of anything.
    for (const s of movement.steps) expect(Number.isInteger(s.delta)).toBe(true);
  });

  it("PINS THE SOURCE COLUMN PER STEP, identical on both sides of the comparison", () => {
    const movement = outreachMovement(current, previous);

    movement.steps.forEach((step, i) => {
      expect(step.source, step.label).toBe(current.funnel[i]!.source);
      expect(step.source, step.label).toBe(previous.funnel[i]!.source);
      expect(step.label).toBe(current.funnel[i]!.label);
      expect(step.label).toBe(previous.funnel[i]!.label);

      // ⚠️ AND THE COUNTS ARE BOUND TO THAT SOURCE, NOT MERELY LABELLED WITH IT.
      // `source` is carried through from the current snapshot, so asserting it
      // alone cannot see a zip that slipped by one: the step would still be
      // labelled "Date Sent" while subtracting a Connection Status count from
      // it. Looking each figure up BY SOURCE on its own side is what makes this
      // test fail when the pairing is wrong.
      expect(step.previous, step.source).toBe(
        previous.funnel.find((f) => f.source === step.source)!.count,
      );
      expect(step.current, step.source).toBe(
        current.funnel.find((f) => f.source === step.source)!.count,
      );
    });
    // The funnel's own source labels, unchanged — so a rename there cannot drift
    // out of the movement panel unnoticed.
    expect(movement.steps.map((s) => s.source)).toEqual([
      "Date Sent",
      "Connection Status",
      "Reply Status",
      "Meeting Booked (date)",
    ]);
  });

  it("REFUSES to compare two differently-defined steps", () => {
    const skewed = {
      ...previous,
      funnel: [previous.funnel[1]!, previous.funnel[0]!, previous.funnel[2]!, previous.funnel[3]!],
    };

    expect(() => outreachMovement(current, skewed)).toThrow(/step/i);
  });

  it("compares a snapshot with ITSELF as all-zero movement, not as an error", () => {
    const movement = outreachMovement(current, current);
    expect(movement.steps.map((s) => s.delta)).toEqual([0, 0, 0, 0]);
    expect(movement.prospects.delta).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THE FUNNEL RULE LIVES IN TWO LANGUAGES AND CANNOT BE DEDUPLICATED.
//
// The staff page computes it in TypeScript from rows it already holds. The
// CLIENT's figure must be computed in SQL, inside the SECURITY DEFINER read,
// because shipping prospect rows out to compute it is precisely what ADR 0012
// forbids. So one rule now has two implementations that can drift — and a Client
// reading 41 replies while staff read 39 would go unnoticed for months, because
// nobody looks at both screens at once.
//
// This suite is the guard. It cannot run Postgres, so it does the next-best
// thing: it reads the SQL as text and pins each predicate against the TypeScript
// rule it mirrors. It CANNOT prove the two agree at runtime — see the note in
// the handoff — but it does fail loudly the moment either side is edited alone.
// ─────────────────────────────────────────────────────────────────────────────

const OUTREACH_SQL = normaliseSql(
  readFileSync(join(process.cwd(), "supabase", "outreach-report-link.sql"), "utf8"),
);

/** Collapse whitespace so a reformat of the SQL doesn't fail these on layout. */
function normaliseSql(sql: string): string {
  return sql.replace(/\s+/g, " ");
}

describe("⚠️ the funnel rule is DUPLICATED in supabase/outreach-report-link.sql — change one, change the other", () => {
  it("SENT: the SQL counts a non-blank date_sent, exactly as buildOutreachAnalytics does", () => {
    // TS: prospects.filter((p) => !isBlank(p.dateSent))
    expect(OUTREACH_SQL).toContain(
      "count(*) filter (where op.date_sent is not null and btrim(op.date_sent) <> '')",
    );
  });

  it("CONNECTED: the SQL matches the VALUE case-insensitively, not the Stage of the same name", () => {
    // TS: (p.connectionStatus ?? "").trim().toLowerCase() === "connected"
    expect(OUTREACH_SQL).toContain(
      "count(*) filter (where lower(btrim(op.connection_status)) = 'connected')",
    );
  });

  it("REPLIED: the SQL excludes BOTH a blank status AND 'no reply' — a blank is not a reply", () => {
    // TS: canonicalReply(p.replyStatus) is neither "no-reply" nor "not-recorded".
    // ⚠️ THE BLANK CLAUSE IS THE ONE THAT GOES MISSING. Simplifying this to
    // `<> 'no reply'` would count every blank cell as somebody having answered,
    // at the narrowest and most-scrutinised end of the funnel.
    expect(OUTREACH_SQL).toContain("op.reply_status is not null");
    expect(OUTREACH_SQL).toContain("btrim(op.reply_status) <> ''");
    expect(OUTREACH_SQL).toContain(
      "lower(regexp_replace(btrim(op.reply_status), '\\s+', ' ', 'g')) <> 'no reply'",
    );
  });

  it("MEETINGS BOOKED: the SQL counts a non-blank meeting_booked_date", () => {
    // TS: prospects.filter((p) => !isBlank(p.meetingBookedDate))
    expect(OUTREACH_SQL).toContain(
      "count(*) filter (where op.meeting_booked_date is not null and btrim(op.meeting_booked_date) <> '')",
    );
  });

  it("names buildOutreachAnalytics in the SQL, so the obligation is readable from the other side", () => {
    expect(OUTREACH_SQL).toContain("buildOutreachAnalytics");
  });

  it("names supabase/outreach-report-link.sql in outreach-analytics.ts, so it is readable from THIS side", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "services", "outreach-analytics.ts"),
      "utf8",
    );
    expect(source).toContain("supabase/outreach-report-link.sql");
  });

  it("picks the latest snapshot with an id tie-break, so two same-second uploads resolve the same way twice", () => {
    expect(OUTREACH_SQL).toContain("order by ou.created_at desc, ou.id desc limit 1");
  });

  it("returns COUNTS ONLY — no prospect string column appears in the aggregate", () => {
    // The privacy boundary, asserted on the text of the boundary itself.
    const aggregate = OUTREACH_SQL.slice(
      OUTREACH_SQL.indexOf("'snapshot_at'"),
      OUTREACH_SQL.indexOf("into v_outreach"),
    );
    expect(aggregate.length).toBeGreaterThan(0);
    for (const column of [
      "full_name",
      "title",
      "company",
      "linkedin_url",
      "location",
      "linkedin_message",
      "notes",
      "rationale",
      "owner",
      "stage",
    ]) {
      expect(aggregate).not.toContain(column);
    }
  });
});
