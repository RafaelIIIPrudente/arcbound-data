import {
  canonicalReply,
  canonicalStage,
  isKnownStage,
  parseCount,
  REPLY_BUCKET_LABELS,
  type ReplyBucket,
} from "@/lib/outreach-vocab";
import type {
  OutreachAnalytics,
  OutreachCount,
  OutreachFunnelStep,
  OutreachMovement,
  OutreachProspect,
  SentTrendPoint,
} from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Everything the Outreach tab shows, computed from ONE snapshot. PURE: no I/O,
// no clock, no randomness — the same rows always give the same figures.
//
// ⚠️ COUNTS ONLY. No rate, percentage, score, rank or benchmark is computed
// anywhere in this file, and a test pins the exact key set of the result so one
// cannot be added quietly. Meetings booked is roughly 8 of 1,220 sent: a
// "conversion rate" from that reads as a verdict on a Client that a sample this
// size cannot support, and the no-score discipline already binding cadence and
// the cross-client comparison binds this page too (ADR 0012).
//
// ⚠️ THE FUNNEL IS NOT DERIVED FROM `Stage`, AND THAT IS THE LOAD-BEARING
// DECISION HERE. `Stage` records the FURTHEST point a prospect reached, so its
// counts are TERMINAL: "Requested 1,216" means 1,216 are STILL at Requested, not
// that 1,216 were ever sent. Stacking those into a funnel would draw a confident
// shape the data does not describe. Each step is counted from the single column
// that defines it unambiguously, and every step carries that column's name to
// screen — because two of them DISAGREE with the Stage breakdown sitting beside
// them (Stage-Replied is 25 while reply-status replies are 39), and an
// unexplained gap is an invitation to "reconcile" two figures that answer
// different questions.
// ─────────────────────────────────────────────────────────────────────────────

/** A cell that carries no value: null, empty, or whitespace only. */
function isBlank(value: string | null): boolean {
  return value === null || value.trim() === "";
}

// Names for absence, one per column, so a blank cell becomes a VISIBLE bar
// rather than a row that quietly leaves the chart.
//
// ⚠️ WORDED PER COLUMN, NOT SHARED. A single generic "Not recorded" would read
// identically in three different charts, and — worse — could collide with a real
// source value. These say which column is missing, and no observed value in any
// of them is a sentence.
const NO_STAGE = "No stage recorded";
const NO_CONNECTION_STATUS = "No connection status recorded";
const UNREADABLE_FOLLOW_UPS = "Count could not be read";

/**
 * The leading `YYYY-MM-DD` of a stored date, or null.
 *
 * ⚠️ STRING MATCHING, NEVER `new Date()`. Constructing a Date to read a date
 * introduces a timezone: `new Date("2026-07-01")` is UTC midnight, which in a
 * negative-offset zone is 30 June locally, and a request would silently move to
 * the previous month's bucket. The stored text already says what day it is.
 */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

function isoDate(value: string | null): string | null {
  if (value === null) return null;
  const match = ISO_DATE.exec(value.trim());
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

/**
 * Group raw values into label+count rows, LARGEST FIRST.
 *
 * ⚠️ ORDERED BY SIZE, WHICH IS NOT A RANKING. It puts the biggest bar at the top
 * so a breakdown is readable; it says nothing about which value is better. Ties
 * fall back to the label so the order is deterministic — an unstable order would
 * make two renders of the same snapshot disagree.
 */
function tally(labels: (string | null)[]): OutreachCount[] {
  const counts = new Map<string, number>();
  for (const label of labels) {
    if (label === null) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Distinct values, in first-seen order, so a disclosure list is stable. */
function distinct(values: string[]): string[] {
  return [...new Set(values)];
}

// ⚠️ THE FOUR FUNNEL RULES BELOW ARE IMPLEMENTED TWICE, IN TWO LANGUAGES.
// The second copy is in `public.report_link_read`
// (`supabase/outreach-report-link.sql`), which computes the SAME four counts in
// SQL for the Client's public Report Link.
//
// A CHANGE HERE MUST BE MADE THERE — otherwise the Client's report will quietly
// disagree with this staff page, and nobody looks at both screens at once.
//
// The duplication CANNOT be removed, and that is a decision rather than debt:
// computing the Client's figure here would mean shipping prospect rows out of
// the database on the public path, which is exactly what ADR 0012 forbids. The
// privacy boundary costs one duplicated rule, so the rule is guarded instead of
// deduplicated — `outreach-analytics.test.ts` pins each SQL predicate against
// its TypeScript twin and fails loudly if either side is edited alone.
export function buildOutreachAnalytics(prospects: OutreachProspect[]): OutreachAnalytics {
  // ── The funnel: four columns, four rules, no Stage ────────────────────────
  const sent = prospects.filter((p) => !isBlank(p.dateSent)).length;

  // ⚠️ MATCHED ON THE VALUE, CASE-INSENSITIVELY — the column holds exactly two
  // values (`Pending` 1218, `Connected` 217) and this counts the accepted one.
  // It is NOT the Stage named "Connected": 217 accepted ≈ 177 still at that
  // stage + 40 who moved further along, and reading this off Stage would lose
  // those 40.
  const connected = prospects.filter(
    (p) => (p.connectionStatus ?? "").trim().toLowerCase() === "connected",
  ).length;

  // ⚠️ "SOMEBODY ANSWERED" — WHICH IS NOT THE SAME TEST AS "not No Reply".
  // A BLANK status must not count: nobody wrote anything down, and counting it
  // would inflate the narrowest, most scrutinised end of the funnel with rows
  // carrying no evidence at all. Reply Status is 100% filled in today's export,
  // which is precisely why this would go unnoticed if it were wrong.
  //
  // An UNRECOGNISED status DOES count. "Not Interested" is not "No Reply", so
  // somebody responded; what the response meant is unknown, and that unknown is
  // disclosed verbatim below rather than resolved by guessing.
  const replied = prospects.filter((p) => {
    const bucket = canonicalReply(p.replyStatus);
    return bucket !== "no-reply" && bucket !== "not-recorded";
  }).length;

  const meetings = prospects.filter((p) => !isBlank(p.meetingBookedDate)).length;

  const funnel: OutreachFunnelStep[] = [
    {
      label: "Requests sent",
      count: sent,
      source: "Date Sent",
      // ⚠️ "A VALUE", NOT "A DATE". This step counts every non-blank Date Sent,
      // including text the timeline later reports as unreadable — so a rule
      // saying "a date is recorded" would be false for precisely those rows, and
      // would contradict the disclosure block further down the same screen.
      rule: "a value is recorded in Date Sent",
    },
    {
      label: "Connections accepted",
      count: connected,
      source: "Connection Status",
      rule: "Connection Status reads Connected",
    },
    {
      label: "Replied",
      count: replied,
      source: "Reply Status",
      rule: "Reply Status is anything other than No Reply, and is not blank",
    },
    {
      label: "Meetings booked",
      count: meetings,
      source: "Meeting Booked (date)",
      rule: "a date is recorded in Meeting Booked",
    },
  ];

  // ── Breakdowns ────────────────────────────────────────────────────────────
  //
  // ⚠️ EVERY BREAKDOWN ACCOUNTS FOR EVERY PROSPECT. The bars in each chart sum
  // to `totalProspects` — always — and an invariant test pins it.
  //
  // This rule exists because the first version broke it in the quietest possible
  // direction. A blank `stage` mapped to null, `tally` skipped nulls, and the
  // chart rendered bars summing to less than the caption's denominator with
  // nothing anywhere to account for the gap. That is the four-state failure in
  // its OMIT form: not an absent value shown as 0, but an absent value shown as
  // nothing at all, under a heading asserting it had been counted. The reply
  // column had it right from the start — `canonicalReply` gives a blank its own
  // `not-recorded` bucket, which charts as a visible bar — and the other columns
  // now do the same. Absence gets a name, and the name goes on the chart.
  const connectionStatus = tally(
    prospects.map((p) =>
      isBlank(p.connectionStatus) ? NO_CONNECTION_STATUS : p.connectionStatus!.trim(),
    ),
  );

  // ⚠️ TALLIED BY BUCKET, THEN LABELLED — NOT TALLIED BY LABEL. Keying the map on
  // the display string would make two buckets that happened to share a label
  // merge into one bar with their counts added, silently turning a labelling
  // typo into fabricated data. Keying on the bucket makes that impossible: a
  // duplicated label would show as two bars with the same name, which is wrong
  // but VISIBLY wrong. (A test also pins that the seven labels are distinct.)
  const replyBuckets = new Map<ReplyBucket, number>();
  for (const p of prospects) {
    const bucket = canonicalReply(p.replyStatus);
    replyBuckets.set(bucket, (replyBuckets.get(bucket) ?? 0) + 1);
  }
  const replyStatus = [...replyBuckets.entries()]
    .map(([bucket, count]) => ({ label: REPLY_BUCKET_LABELS[bucket], count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  // ⚠️ EVERY STAGE UNDER ITS OWN NAME, KNOWN OR NOT. An unknown stage keeps its
  // value as its label, so two unfamiliar stages stay two rows with two counts.
  // Replacing them with a shared "unrecognised" label would merge them into one
  // bar and add their counts together — bucketing away, wearing disclosure's
  // clothes. Unfamiliarity is reported separately, below.
  const stage = tally(prospects.map((p) => canonicalStage(p.stage) ?? NO_STAGE));

  // ── Disclosure: values nobody has taught ArcBase to read ───────────────────
  const unrecognisedReplyValues = distinct(
    prospects
      .filter((p) => canonicalReply(p.replyStatus) === "unrecognised")
      // Non-null by construction: a blank status is `not-recorded`, never
      // `unrecognised`, so anything reaching here has text to show.
      .map((p) => p.replyStatus!.trim()),
  );

  const unrecognisedStageValues = distinct(
    prospects
      .filter((p) => !isBlank(p.stage) && !isKnownStage(p.stage))
      .map((p) => p.stage!.trim()),
  );

  // ── Date Sent, outlier included ───────────────────────────────────────────
  //
  // ⚠️ NOTHING IS FILTERED OUT OF THIS SERIES. One real row sits at `2020-12-04`
  // against an otherwise-2026 range. Every cutoff that would remove it is a
  // judgement the data does not support, so it stays in the buckets AND the
  // range below publishes it, which puts the odd date in front of a reader
  // instead of deleting it behind their back. Silent filtering is the one option
  // not available (ADR 0009).
  const buckets = new Map<string, number>();
  const readableDates: string[] = [];
  const unreadableSent: string[] = [];
  let undatedSent = 0;

  for (const p of prospects) {
    if (isBlank(p.dateSent)) {
      undatedSent += 1;
      continue;
    }
    const date = isoDate(p.dateSent);
    if (date === null) {
      // Recorded, but not as a date. A different fact from "not recorded", and
      // shown verbatim so somebody can fix the sheet.
      unreadableSent.push(p.dateSent!.trim());
      continue;
    }
    readableDates.push(date);
    const month = date.slice(0, 7);
    buckets.set(month, (buckets.get(month) ?? 0) + 1);
  }

  const sentOverTime = [...buckets.entries()]
    .map(([date, count]) => ({ date, count }))
    // `YYYY-MM` sorts chronologically as text — no Date, no timezone.
    .sort((a, b) => a.date.localeCompare(b.date));

  const sortedDates = [...readableDates].sort();
  const sentDateRange =
    sortedDates.length === 0
      ? null
      : { earliest: sortedDates[0]!, latest: sortedDates[sortedDates.length - 1]! };

  // ── Follow-up counts (a TEXT column, read at read time) ───────────────────
  //
  // ⚠️ AN UNREADABLE CELL NEVER LANDS IN THE `0` BUCKET. "0" is 1,320 of 1,435
  // rows, so anything folded into it is invisible forever.
  const followUpLabels: string[] = [];
  let unreadableFollowUpCounts = 0;
  for (const p of prospects) {
    const value = parseCount(p.followUpCount);
    if (value === null) {
      unreadableFollowUpCounts += 1;
      // Same rule as the other breakdowns: absence gets a name and a bar, so
      // this chart also sums to the snapshot total.
      followUpLabels.push(UNREADABLE_FOLLOW_UPS);
      continue;
    }
    followUpLabels.push(String(value));
  }
  // Numeric order, with the unreadable bar pinned last — `Number("Count could
  // not be read")` is NaN, and NaN comparisons are false, which would leave the
  // sort order dependent on insertion. Naming the case keeps it deterministic.
  const followUps = tally(followUpLabels).sort((a, b) => {
    if (a.label === UNREADABLE_FOLLOW_UPS) return 1;
    if (b.label === UNREADABLE_FOLLOW_UPS) return -1;
    return Number(a.label) - Number(b.label);
  });

  return {
    totalProspects: prospects.length,
    funnel,
    stage,
    connectionStatus,
    replyStatus,
    followUps,
    unreadableFollowUpCounts,
    unrecognisedReplyValues,
    unrecognisedStageValues,
    sentOverTime,
    undatedSent,
    unreadableSentValues: distinct(unreadableSent),
    sentDateRange,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// S5 — TRENDS. Two pure helpers over what `buildOutreachAnalytics` already
// computed. Neither reads the database, and neither recomputes a figure that
// exists above.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Month names for the axis. A LOOKUP, NOT `toLocaleDateString`.
 *
 * ⚠️ THE SAME REASON `isoDate` MATCHES STRINGS. Formatting `YYYY-MM` for a
 * human through a `Date` would first have to construct one, and
 * `new Date("2026-07")` is UTC midnight — which in a negative-offset zone
 * renders as June. A label that disagrees with the bucket it sits under is
 * worse than no label.
 */
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** `YYYY-MM` → months since year 0, so month arithmetic is plain integer maths. */
function monthIndex(ym: string): number {
  return Number(ym.slice(0, 4)) * 12 + (Number(ym.slice(5, 7)) - 1);
}

/** The inverse. */
function monthKey(index: number): string {
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** `2026-07` → `Jul 2026`. */
function monthLabel(ym: string): string {
  return `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
}

/**
 * Every month between the first and last bucket, empty ones included as `0`.
 *
 * ⚠️ THIS ZERO IS A REAL ZERO, AND THAT IS THE ONLY REASON IT IS ALLOWED.
 * Everywhere else on this page an absent value renders as a gap and never as 0 —
 * a blank Stage gets its own named bar, an unreadable follow-up count never
 * lands in the "0" bucket, a failed read shows no figures at all. Here the rule
 * INVERTS, deliberately: `sentOverTime` is built from a column whose date range
 * is KNOWN, so "no requests were sent in February" is an observation the data
 * supports, not a measurement nobody took. The distinction is the same one the
 * rest of the file enforces — never assert what was not measured — applied to a
 * case where the absence IS the measurement.
 *
 * Without this, `sentOverTime` renders January beside March and the chart
 * silently claims February did not exist.
 */
export function fillSentMonths(
  series: { date: string; count: number }[],
): { date: string; count: number }[] {
  if (series.length === 0) return [];

  const byMonth = new Map(series.map((m) => [m.date, m.count]));
  // Derived from the data rather than from its order: the caller sorts, but a
  // fill that silently depended on that would break quietly if it stopped.
  const indices = series.map((m) => monthIndex(m.date));
  const first = Math.min(...indices);
  const last = Math.max(...indices);

  const filled: { date: string; count: number }[] = [];
  for (let i = first; i <= last; i += 1) {
    const date = monthKey(i);
    filled.push({ date, count: byMonth.get(date) ?? 0 });
  }
  return filled;
}

/**
 * Runs of empty months shorter than this stay as real zero bars.
 *
 * ⚠️ THREE IS A JUDGEMENT, AND IT IS THE ONE THE FILL EXISTS FOR. One or two
 * quiet months are legible as bars and are exactly the "February did not vanish"
 * case; past that the axis costs more than it says. The real snapshot runs
 * `2020-12` → 2026 — 68 months, of which 61 are consecutive dormancy — and drawn
 * in full the six months that actually carry the Client's outreach are squeezed
 * into the right-hand tenth of the chart.
 */
const MIN_COLLAPSED_RUN = 3;

/**
 * The requests-sent timeline: filled months, with long dormancies compressed.
 *
 * ⚠️ COMPRESSED, NEVER TRIMMED, AND THE COMPRESSION SAYS SO WHERE IT HAPPENS.
 * The `2020-12-04` row is real and S3 already decided it is neither filtered nor
 * hidden (`sentDateRange` publishes it). Dropping the early months to make the
 * chart pretty is the one option not available: it would delete a genuine
 * observation to improve a picture. So the span is kept whole and its empty
 * stretch becomes ONE labelled point reading "61 months, none sent (Jan 2021 –
 * Jan 2026)" — a broken axis that names its own break, which a reader can
 * audit, rather than a smooth axis that quietly lost five years.
 */
export function sentTrend(
  series: { date: string; count: number }[],
  minRun: number = MIN_COLLAPSED_RUN,
): SentTrendPoint[] {
  const filled = fillSentMonths(series);
  const points: SentTrendPoint[] = [];

  let i = 0;
  while (i < filled.length) {
    if (filled[i]!.count === 0) {
      let end = i;
      while (end < filled.length && filled[end]!.count === 0) end += 1;
      const months = end - i;

      if (months >= minRun) {
        const from = filled[i]!.date;
        const to = filled[end - 1]!.date;
        points.push({
          kind: "gap",
          months,
          from,
          to,
          // `count: null` — not 0. See `SentTrendPoint`: this is many months
          // compressed, not one month that measured nothing.
          count: null,
          label: `${months} months, none sent (${monthLabel(from)} – ${monthLabel(to)})`,
        });
        i = end;
        continue;
      }
    }

    const month = filled[i]!;
    points.push({
      kind: "month",
      date: month.date,
      label: monthLabel(month.date),
      count: month.count,
    });
    i += 1;
  }

  return points;
}

/**
 * What moved between two snapshots. PURE, and RECOMPUTED FROM RAW ROWS.
 *
 * ⚠️ BOTH SIDES COME FROM `buildOutreachAnalytics`, WHICH IS THE POINT. ADR 0009:
 * raw values are never rewritten and interpretation happens at read time, so a
 * corrected reading fixes every past snapshot at once. Freezing per-snapshot
 * counts into the database at ingest would leave old snapshots asserting
 * arithmetic the app no longer believes — and the reply vocabulary has already
 * changed once.
 *
 * ⚠️ THE STEPS ARE PAIRED BY POSITION AND THEN CHECKED. Both funnels are built
 * by the same function, so they agree by construction; this throws anyway,
 * because the failure it guards against is silent. A zip that slipped by one
 * would subtract "connections accepted" from "requests sent" and return a
 * perfectly plausible integer, and no reader could ever tell.
 */
export function outreachMovement(
  current: OutreachAnalytics,
  previous: OutreachAnalytics,
): OutreachMovement {
  if (current.funnel.length !== previous.funnel.length) {
    throw new Error(
      `Outreach movement needs two funnels of the same shape: ${current.funnel.length} steps against ${previous.funnel.length}.`,
    );
  }

  const steps = current.funnel.map((step, i) => {
    const before = previous.funnel[i]!;
    if (before.label !== step.label || before.source !== step.source) {
      throw new Error(
        `Outreach movement compared two different steps: "${step.label}" (${step.source}) against "${before.label}" (${before.source}).`,
      );
    }
    return {
      label: step.label,
      source: step.source,
      previous: before.count,
      current: step.count,
      // A difference of two counts. Nothing is divided by anything, here or
      // downstream — see `OutreachMovementStep`.
      delta: step.count - before.count,
    };
  });

  return {
    steps,
    prospects: {
      previous: previous.totalProspects,
      current: current.totalProspects,
      delta: current.totalProspects - previous.totalProspects,
    },
  };
}
