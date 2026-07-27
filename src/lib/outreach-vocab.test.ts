import { describe, expect, it } from "vitest";

import {
  canonicalReply,
  canonicalStage,
  isKnownStage,
  OUTREACH_STAGES,
  parseCount,
  REPLY_BUCKET_LABELS,
  replyDate,
  type ReplyBucket,
} from "./outreach-vocab";

// ─────────────────────────────────────────────────────────────────────────────
// READ-TIME canonicalisation. Nothing here is ever written back: the stored
// value stays exactly as the export sent it (ADR 0009), and these functions only
// decide how to GROUP it on a chart. Every fixture below is a value observed in
// the real 1,435-row file (spec, 2026-07-27) — the dirt is the point.
// ─────────────────────────────────────────────────────────────────────────────

/** Every distinct Reply Status observed in the source, with its row count. */
const OBSERVED_REPLY: [string, number][] = [
  ["No Reply", 1396],
  ["Replied - Positive", 17],
  ["Replied - Neutral", 4],
  ["Replied", 3],
  ["Replied - Interested", 2],
  ["Not Interested", 1],
  ["Replied - Negative", 1],
  ["Replied 2026-07-13", 3],
  ["Replied 2026-07-14", 2],
  ["Replied 2026-06-30", 1],
  ["Replied 2026-07-01", 1],
  ["Replied 2026-07-02", 1],
  ["Replied 2026-07-06", 1],
  ["Replied 2026-07-09", 1],
  ["Replied 2026-07-16", 1],
];

describe("canonicalReply — the observed vocabulary", () => {
  /**
   * The two values this module deliberately REFUSES to interpret.
   *
   * ⚠️ ONE ROW AND TWO ROWS. That is exactly the scale at which a wrong guess is
   * invisible: nobody auditing a 1,435-row funnel would spot three rows filed
   * under the wrong sentiment. The source has an explicit Positive / Neutral /
   * Negative trio, and neither of these is in it — "Interested" and "Not
   * Interested" are words somebody typed. Filing them by resemblance would be
   * inventing data, so they reach `unrecognised` and are printed verbatim for a
   * human to decide.
   */
  const REFUSED = ["Replied - Interested", "Not Interested"];

  it("buckets the 13 values it genuinely recognises, and refuses exactly 2", () => {
    // ⚠️ ASSERTS BOTH DIRECTIONS ON PURPOSE. A test that only checked "nothing
    // falls through" would pass if the refusals were quietly mapped back, and a
    // test that only checked the refusals would pass if the other 13 broke. The
    // partition is the contract.
    for (const [raw] of OBSERVED_REPLY) {
      const refused = REFUSED.includes(raw);
      expect(canonicalReply(raw) === "unrecognised", `${raw}`).toBe(refused);
    }
    expect(OBSERVED_REPLY).toHaveLength(15);
    expect(REFUSED).toHaveLength(2);
  });

  it("maps the named sentiments", () => {
    expect(canonicalReply("No Reply")).toBe("no-reply");
    expect(canonicalReply("Replied - Positive")).toBe("positive");
    expect(canonicalReply("Replied - Neutral")).toBe("neutral");
    expect(canonicalReply("Replied - Negative")).toBe("negative");
  });

  it("REFUSES to read 'Replied - Interested' as positive", () => {
    // "Interested" is not one of the three sentiment words the source uses. It
    // plausibly means positive — and plausible is not observed.
    expect(canonicalReply("Replied - Interested")).toBe("unrecognised");
    expect(canonicalReply("Replied - Interested")).not.toBe("positive");
  });

  it("REFUSES to read 'Not Interested' as negative", () => {
    // ⚠️ AND IT DOES NOT START WITH "Replied", SO IT IS NOT EVEN CERTAINLY A
    // REPLY. Filing it under `negative` would assert two things at once — that
    // somebody answered, and that the answer was bad — from one row of evidence.
    expect(canonicalReply("Not Interested")).toBe("unrecognised");
    expect(canonicalReply("Not Interested")).not.toBe("negative");
    expect(canonicalReply("Not Interested")).not.toBe("no-reply");
  });

  it("maps a bare 'Replied' to replied-unspecified, NOT to positive", () => {
    // ⚠️ THEY REPLIED; NOBODY SAID HOW IT WENT. Folding an unstated sentiment
    // into `positive` would invent 3 good replies out of 3 unknown ones — a
    // score conjured from an absence, which is the failure this repo keeps
    // fixing. `replied-unspecified` says exactly what is known.
    expect(canonicalReply("Replied")).toBe("replied-unspecified");
    expect(canonicalReply("Replied")).not.toBe("positive");
  });
});

describe("canonicalReply — the eight rows with a date typed into the status", () => {
  it("strips a trailing ISO date and buckets what remains", () => {
    expect(canonicalReply("Replied 2026-07-13")).toBe("replied-unspecified");
    expect(canonicalReply("Replied 2026-06-30")).toBe("replied-unspecified");
  });

  it("strips the date from EVERY dated variant observed", () => {
    const dated = OBSERVED_REPLY.filter(([raw]) => /\d{4}-\d{2}-\d{2}/.test(raw));
    expect(dated).toHaveLength(8);
    for (const [raw] of dated) {
      expect(canonicalReply(raw), raw).toBe("replied-unspecified");
    }
  });

  it("buckets a dated value the SAME as the undated one — the date is not a status", () => {
    expect(canonicalReply("Replied 2026-07-13")).toBe(canonicalReply("Replied"));
  });

  it("still buckets a dated SENTIMENT by its sentiment", () => {
    expect(canonicalReply("Replied - Positive 2026-07-13")).toBe("positive");
  });
});

describe("replyDate — the stripped date is EVIDENCE, not noise", () => {
  // ⚠️ THIS IS THE ONLY REPLY DATE IN THE ENTIRE SOURCE. ADR 0012 records that
  // the file has no `Date Replied` column, which is why movement has to be
  // computed by comparing snapshots. On these eight rows somebody typed the date
  // into the status field by hand — so stripping it for bucketing and then
  // throwing it away would destroy the one place that evidence exists.
  it("returns the date that canonicalReply strips", () => {
    expect(replyDate("Replied 2026-07-13")).toBe("2026-07-13");
    expect(replyDate("Replied 2026-06-30")).toBe("2026-06-30");
  });

  it("returns a date for all eight dated rows and for none of the others", () => {
    for (const [raw] of OBSERVED_REPLY) {
      const expected = /\d{4}-\d{2}-\d{2}/.test(raw);
      expect(replyDate(raw) !== null, raw).toBe(expected);
    }
  });

  it("returns NULL — never a fabricated or defaulted date — when there is none", () => {
    expect(replyDate("Replied")).toBeNull();
    expect(replyDate("No Reply")).toBeNull();
    expect(replyDate(null)).toBeNull();
    expect(replyDate("")).toBeNull();
  });

  it("returns the date TEXT verbatim without validating it as a calendar date", () => {
    // Shape-matching only: interpretation belongs to whoever builds a timeline,
    // and an impossible date must reach them intact rather than be silently
    // corrected or dropped here.
    expect(replyDate("Replied 2026-13-45")).toBe("2026-13-45");
  });
});

describe("canonicalReply — absence never becomes a measurement", () => {
  // ⚠️ THE MOST IMPORTANT TEST IN THIS FILE. "No Reply" is a RECORDED FACT on
  // 1,396 rows. A blank cell is nobody having written anything down. Collapsing
  // the second into the first would silently add rows to the largest bucket on
  // the chart and make the funnel look complete when it is merely unfilled.
  it("maps null to not-recorded, NOT to no-reply", () => {
    expect(canonicalReply(null)).toBe("not-recorded");
    expect(canonicalReply(null)).not.toBe("no-reply");
  });

  it("maps an empty or whitespace-only status to not-recorded", () => {
    expect(canonicalReply("")).toBe("not-recorded");
    expect(canonicalReply("   ")).toBe("not-recorded");
    expect(canonicalReply("   ")).not.toBe("no-reply");
  });

  it("keeps not-recorded and unrecognised apart — they are different failures", () => {
    // Nothing written down, versus something written that nobody has taught the
    // app to read. The first needs no action; the second needs disclosure.
    expect(canonicalReply(null)).not.toBe(canonicalReply("Ghosted"));
  });
});

describe("canonicalReply — unknown values are disclosed, never bucketed away", () => {
  it("returns unrecognised for a value outside the vocabulary", () => {
    expect(canonicalReply("Ghosted")).toBe("unrecognised");
    expect(canonicalReply("Replied on the phone")).toBe("unrecognised");
  });

  it("does NOT guess from a substring — 'Replied' inside a phrase is not a bucket", () => {
    // ⚠️ SUBSTRING MATCHING WOULD BE THE SILENT BUCKETING ADR 0012 FORBIDS.
    // "Not Replied Yet" contains "Replied"; treating it as a reply would move a
    // row from the no-reply end of the funnel to the replied end on the strength
    // of a coincidence.
    expect(canonicalReply("Not Replied Yet")).toBe("unrecognised");
  });

  it("leaves the caller holding the RAW value, so it can be shown verbatim", () => {
    // The disclosure contract S3 relies on: bucket says unrecognised, the caller
    // still has the string it passed in and prints that, unaltered.
    const raw = "Replied — maybe?";
    expect(canonicalReply(raw)).toBe("unrecognised");
    expect(raw).toBe("Replied — maybe?");
  });
});

describe("canonicalReply — tolerant of formatting, never of meaning", () => {
  it("ignores case and surrounding whitespace", () => {
    expect(canonicalReply("  no reply  ")).toBe("no-reply");
    expect(canonicalReply("REPLIED - POSITIVE")).toBe("positive");
  });

  it("ignores spacing around the hyphen", () => {
    expect(canonicalReply("Replied-Positive")).toBe("positive");
    expect(canonicalReply("Replied  -  Positive")).toBe("positive");
  });

  it("survives the untrimmed values the parser deliberately preserves", () => {
    // parse-outreach stores "  Replied 2026-07-13  " with its whitespace intact,
    // so read-time canonicalisation is where that stops mattering.
    expect(canonicalReply("  Replied 2026-07-13  ")).toBe("replied-unspecified");
    expect(replyDate("  Replied 2026-07-13  ")).toBe("2026-07-13");
  });
});

describe("REPLY_BUCKET_LABELS", () => {
  it("labels EVERY bucket — a missing one would render as undefined on a chart", () => {
    const buckets: ReplyBucket[] = [
      "no-reply",
      "positive",
      "neutral",
      "negative",
      "replied-unspecified",
      "unrecognised",
      "not-recorded",
    ];
    // A whitelist: a bucket added without a label, or a label left behind after a
    // bucket is removed, both fail here.
    expect(Object.keys(REPLY_BUCKET_LABELS).sort()).toEqual([...buckets].sort());
    for (const bucket of buckets) {
      expect(REPLY_BUCKET_LABELS[bucket], bucket).toBeTruthy();
    }
  });

  it("distinguishes 'nothing recorded' from 'not recognised' in the WORDING too", () => {
    expect(REPLY_BUCKET_LABELS["not-recorded"]).not.toBe(REPLY_BUCKET_LABELS.unrecognised);
  });

  it("gives every bucket a DISTINCT label — a duplicate would merge two states on a chart", () => {
    // ⚠️ NOT PEDANTRY: THESE LABELS REACH A CHART AS CATEGORY NAMES. Two buckets
    // sharing a label put two different reply states under one bar heading, so a
    // single-character typo here becomes fabricated data on screen. The analytics
    // service also tallies by BUCKET rather than by label so a duplicate shows as
    // two same-named bars instead of one merged one — this test is the other half
    // of that defence, and it is the half that says "fix the typo".
    const labels = Object.values(REPLY_BUCKET_LABELS);

    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toHaveLength(7);
  });

  it("gives every bucket a label with real words in it", () => {
    // `toBeTruthy()` alone is satisfied by "x"; this asks for something a reader
    // could act on.
    for (const [bucket, label] of Object.entries(REPLY_BUCKET_LABELS)) {
      expect(label.trim().length, bucket).toBeGreaterThan(3);
      expect(label, bucket).toMatch(/[a-z]/i);
    }
  });

  it("carries no score, grade, or ranking word", () => {
    // ADR 0012 and the global constraints: descriptive counts only.
    const GRADE_WORDS =
      /\b(best|worst|good|bad|optimal|recommended?|top|score|grade|rank(ing)?)\b/i;
    for (const label of Object.values(REPLY_BUCKET_LABELS)) {
      expect(label, label).not.toMatch(GRADE_WORDS);
    }
  });
});

describe("canonicalStage", () => {
  it("lists the ten observed stages, spelled exactly", () => {
    expect([...OUTREACH_STAGES].sort()).toEqual(
      [
        "Requested",
        "Connected",
        "Replied",
        "In Conversation",
        "Meeting Booked",
        "Client",
        "Passed",
        "Closed - Low Fit",
        "Closed - Disqualified",
        "Closed - Rejected",
      ].sort(),
    );
    expect(OUTREACH_STAGES).toHaveLength(10);
  });

  it("returns each known stage as its canonical spelling", () => {
    for (const stage of OUTREACH_STAGES) {
      expect(canonicalStage(stage), stage).toBe(stage);
    }
  });

  it("normalises case and hyphen spacing to the canonical spelling", () => {
    expect(canonicalStage("meeting booked")).toBe("Meeting Booked");
    expect(canonicalStage("  REQUESTED ")).toBe("Requested");
    expect(canonicalStage("Closed-Low Fit")).toBe("Closed - Low Fit");
    expect(canonicalStage("closed  -  disqualified")).toBe("Closed - Disqualified");
  });

  it("DOES NOT GROUP the three Closed stages into one", () => {
    // ⚠️ CANONICAL MEANS SPELLING, NOT GROUPING. Rolling "Closed - Low Fit",
    // "Closed - Disqualified" and "Closed - Rejected" into a single "Closed"
    // would erase why four prospects ended — the exact silent bucketing ADR 0012
    // rules out. Whoever wants a combined figure must combine it deliberately,
    // in the open, where the reader can see it happen.
    //
    // ⚠️ COMPARED AS AN ARRAY OF STRINGS, NOT VIA `new Set([...])`. A Set of
    // three distinct OBJECT references has size 3 whatever the objects contain,
    // so if this function ever returned a struct the Set version would pass
    // vacuously while grouping went in unnoticed.
    expect([
      canonicalStage("Closed - Low Fit"),
      canonicalStage("Closed - Disqualified"),
      canonicalStage("Closed - Rejected"),
    ]).toEqual(["Closed - Low Fit", "Closed - Disqualified", "Closed - Rejected"]);
  });

  it("keeps 'Connected' the STAGE distinct from the Connection Status flag", () => {
    // ⚠️ Stage and Connection Status share the word and mean different things:
    // Stage is the furthest point reached, Connection Status is a binary
    // accepted/pending flag. 217 accepted ≈ 177 still at Connected + 40 further
    // along. This module canonicalises them separately and never reconciles them.
    expect(canonicalStage("Connected")).toBe("Connected");
    expect(canonicalReply("Connected")).toBe("unrecognised");
  });

  it("returns an UNKNOWN stage verbatim rather than dropping it", () => {
    // ⚠️ THE LABEL STAYS THE VALUE, AND `isKnownStage` CARRIES THE SIGNAL. The
    // tempting alternative — returning the literal string "unrecognised" — would
    // MERGE every unknown stage into one chart row, so "Nurturing" and "Warm
    // Lead" would land in a single unnamed bar with their counts added together.
    // That is precisely the bucketing-away this module exists to prevent, so
    // unknown-ness is reported beside the value instead of replacing it.
    expect(canonicalStage("Nurturing")).toBe("Nurturing");
    expect(canonicalStage("  Nurturing  ")).toBe("Nurturing");
  });

  it("keeps two DIFFERENT unknown stages apart", () => {
    expect(canonicalStage("Nurturing")).not.toBe(canonicalStage("Warm Lead"));
  });
});

describe("isKnownStage — the signal that drives the disclosure list", () => {
  it("is true for every stage the source is known to use", () => {
    for (const stage of OUTREACH_STAGES) {
      expect(isKnownStage(stage), stage).toBe(true);
    }
  });

  it("forgives formatting, exactly as canonicalStage does", () => {
    expect(isKnownStage("  meeting booked ")).toBe(true);
    expect(isKnownStage("Closed-Low Fit")).toBe(true);
  });

  it("is false for a stage nobody has taught the app", () => {
    expect(isKnownStage("Nurturing")).toBe(false);
    expect(isKnownStage("Warm Lead")).toBe(false);
  });

  it("is false for a MISSING stage — absence is not a known value", () => {
    // The caller must not put a blank into the unrecognised-values list: there
    // is no string to show, and "" on screen names nothing.
    expect(isKnownStage(null)).toBe(false);
    expect(isKnownStage("")).toBe(false);
    expect(isKnownStage("   ")).toBe(false);
  });
});

describe("parseCount — Follow-up Count is stored as TEXT (ADR 0009)", () => {
  it("reads the three observed values", () => {
    expect(parseCount("0")).toBe(0);
    expect(parseCount("1")).toBe(1);
    expect(parseCount("2")).toBe(2);
  });

  it("reads a RECORDED ZERO as 0 — it is a measurement, not a gap", () => {
    // ⚠️ 1,320 of 1,435 rows carry "0". If this returned null the commonest
    // value in the column would read as unrecorded.
    expect(parseCount("0")).toBe(0);
    expect(parseCount("0")).not.toBeNull();
  });

  it("returns NULL for a blank — never 0", () => {
    // ⚠️ THE INVERSE, AND THE WHOLE REASON THIS FUNCTION EXISTS. "Nobody wrote a
    // number down" and "somebody wrote zero" are different facts; collapsing
    // them would silently add rows to the largest bucket in the column.
    expect(parseCount(null)).toBeNull();
    expect(parseCount("")).toBeNull();
    expect(parseCount("   ")).toBeNull();
    expect(parseCount(null)).not.toBe(0);
    expect(parseCount("")).not.toBe(0);
  });

  it("returns NULL for text that is not a count — never NaN, never 0", () => {
    // NaN is worse than null: it propagates silently through arithmetic and
    // surfaces as an empty cell nobody can trace back to a source value.
    for (const raw of ["n/a", "N/A", "none", "two", "-", "?", "1 (voicemail)"]) {
      expect(parseCount(raw), raw).toBeNull();
      expect(Number.isNaN(parseCount(raw) as number), raw).toBe(false);
    }
  });

  it("returns NULL for a non-integer — a count of 1.5 is not a count", () => {
    expect(parseCount("1.5")).toBeNull();
    expect(parseCount("1e3")).toBeNull();
  });

  it("tolerates surrounding whitespace, because the parser preserves it", () => {
    expect(parseCount("  2  ")).toBe(2);
  });

  it("does not judge plausibility — a negative count is READ, then disclosed", () => {
    // ⚠️ READING AND JUDGING ARE DIFFERENT JOBS. "-1" is unambiguously a number,
    // so refusing to read it would hide a data-quality fact behind the same null
    // that means "blank". Whoever displays it decides what a negative follow-up
    // count means.
    expect(parseCount("-1")).toBe(-1);
  });

  it("returns NULL for a missing stage — never an invented one", () => {
    expect(canonicalStage(null)).toBeNull();
    expect(canonicalStage("")).toBeNull();
    expect(canonicalStage("   ")).toBeNull();
  });
});

describe("purity", () => {
  it("does not mutate or normalise the value it was given", () => {
    const raw = "  Replied - Positive  ";
    canonicalReply(raw);
    replyDate(raw);
    canonicalStage(raw);
    expect(raw).toBe("  Replied - Positive  ");
  });

  it("is deterministic — the same input always gives the same bucket", () => {
    for (const [value] of OBSERVED_REPLY) {
      expect(canonicalReply(value)).toBe(canonicalReply(value));
    }
  });
});
