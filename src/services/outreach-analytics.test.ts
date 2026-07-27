import { describe, expect, it } from "vitest";

import type { OutreachProspect } from "@/services/types";

import { buildOutreachAnalytics } from "./outreach-analytics";

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

describe("buildOutreachAnalytics — NO RATES, SCORES OR RANKINGS", () => {
  it("exposes no percentage, rate, score, rank or benchmark field", () => {
    // ⚠️ A WHITELIST, SO A DERIVED FIGURE CANNOT BE ADDED QUIETLY. Meetings
    // booked is ~8 of ~1,220: any rate computed here reads as a verdict the
    // sample cannot support.
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
