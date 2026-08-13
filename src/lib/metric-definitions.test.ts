import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { BiPostRow } from "@/services/analytics";
import { buildDashboardAnalytics } from "@/services/analytics";

import {
  METRIC_DEFINITIONS,
  OUTREACH_SUMMARY_METRIC_KEYS,
  REPORT_METRIC_KEYS,
  REPORT_STATUS_METRIC_KEYS,
  metricDefinition,
} from "./metric-definitions";

const MODULE = "src/lib/metric-definitions.ts";

// ─────────────────────────────────────────────────────────────────────────────
// The point of this file is that a definition CANNOT quietly drift from the
// thing it defines. Two guards do that work: the coverage test drives the record
// from labels `buildDashboardAnalytics` really emits, and the collision test
// pins that the four rates sharing one on-screen label stay four distinct
// sentences.
// ─────────────────────────────────────────────────────────────────────────────

function row(over: Partial<BiPostRow> = {}): BiPostRow {
  return {
    client_id: "c1",
    client_name: "Ada Lovelace",
    linkedin_post_id: "p1",
    post_url: null,
    post_content: null,
    post_age: null,
    estimated_post_date: "2026-07-15",
    impressions: 1000,
    likes: 10,
    comments: 2,
    reposts: 1,
    saves: 3,
    interactions: 16,
    provided_engagement_rate: null,
    calculated_engagement_rate: null,
    scraped_at: "2026-07-16T06:00:00.000Z",
    uploaded_at: null,
    ...over,
  };
}

const NOW = new Date("2026-07-16T12:00:00.000Z");
const ANALYTICS = buildDashboardAnalytics([row()], {
  range: { kind: "preset", days: 30 },
  now: NOW,
});

describe("every metric the dashboard puts on screen has a definition", () => {
  it("emits the labels this test is about, so it cannot pass vacuously", () => {
    // Guard the guard: if the service stopped emitting KPIs, the coverage test
    // below would iterate an empty list and pass while defining nothing.
    expect(ANALYTICS.kpis.length).toBeGreaterThanOrEqual(5);
    expect(ANALYTICS.hero.label).toBe("Impressions");
  });

  it("defines the hero and EVERY secondary KPI the service actually emits", () => {
    // ⚠️ DRIVEN FROM THE REAL SERVICE OUTPUT, NOT A HAND-COPIED LIST. Adding a
    // seventh KPI to `buildDashboardAnalytics` without writing a definition for
    // it fails HERE, which is the only thing stopping the ⓘ coverage from
    // silently falling behind the screen.
    const labels = [ANALYTICS.hero.label, ...ANALYTICS.kpis.map((k) => k.label)];

    const undefined_ = labels.filter((label) => metricDefinition(label) === undefined);
    expect(undefined_).toEqual([]);
  });

  it("gives every definition a non-empty term and sentence", () => {
    for (const [key, entry] of Object.entries(METRIC_DEFINITIONS)) {
      expect(entry.term.trim(), key).not.toBe("");
      // Long enough to actually say something — a one-word "definition" is the
      // shape this record exists to prevent.
      expect(entry.definition.trim().length, key).toBeGreaterThan(40);
    }
  });
});

describe('the four statistics that all render as "Engagement rate"', () => {
  const RATE_KEYS = [
    "engagementRateWindow",
    "engagementRatePerPost",
    "engagementRatePerClient",
    "engagementRateMedianAcrossClients",
  ] as const;

  it("keeps all four, each with its own key", () => {
    for (const key of RATE_KEYS) {
      expect(metricDefinition(key), key).toBeDefined();
    }
  });

  it("gives each of them a DIFFERENT sentence", () => {
    // ⚠️ THE WHOLE POINT. Four screens print one label over four different
    // numbers; four identical definitions would document the ambiguity rather
    // than resolve it.
    const sentences = RATE_KEYS.map((k) => metricDefinition(k)!.definition);

    expect(new Set(sentences).size).toBe(RATE_KEYS.length);
  });

  it("says of each which one it is, in terms a reader can act on", () => {
    // Each sentence must name its own SCOPE, so a reader holding two screens
    // side by side can tell why the numbers differ.
    expect(metricDefinition("engagementRateWindow")!.definition).toMatch(/whole window/i);
    expect(metricDefinition("engagementRatePerPost")!.definition).toMatch(/one post|per-post/i);
    expect(metricDefinition("engagementRatePerClient")!.definition).toMatch(
      /one client|that client/i,
    );
    expect(metricDefinition("engagementRateMedianAcrossClients")!.definition).toMatch(
      /median across clients/i,
    );
  });

  it("warns, on the two that could be mistaken for each other, that they will not reconcile", () => {
    // The dashboard's rate is a ratio of totals; the posts table's is per-post.
    // A reader who expects one to be the mean of the other is not confused —
    // they were never told.
    expect(metricDefinition("engagementRateWindow")!.definition).toMatch(
      /not.*average|rather than.*average/i,
    );
    expect(metricDefinition("engagementRatePerPost")!.definition).toMatch(/will not average out/i);
  });
});

describe("the definitions match the formulas they describe", () => {
  it("states the window rate as interactions ÷ impressions, which is what weightedRate does", () => {
    // Cross-checked against the real computation rather than asserted in prose
    // alone: one post with 16 interactions on 1,000 impressions is 1.6%.
    expect(ANALYTICS.engagement.value).toBe(1.6);
    expect(metricDefinition("engagementRateWindow")!.definition).toMatch(
      /interactions divided by total impressions/i,
    );
  });

  it("owns the KPI delta's ▲100% 'grew from nothing' branch", () => {
    // ⚠️ A REAL BRANCH IN `toKpi`, not an edge case a definition may skip: when
    // the prior window summed to zero and this one did not, the chip reads
    // ▲100%. A definition that omitted it would leave the one delta a reader is
    // most likely to disbelieve unexplained.
    expect(metricDefinition("kpiDelta")!.definition).toMatch(/100%/);
    expect(metricDefinition("kpiDelta")!.definition).toMatch(/grew from nothing/i);
  });

  it("distinguishes the two delta UNITS — percent change vs. percentage points", () => {
    expect(metricDefinition("kpiDelta")!.definition).toMatch(/percent change/i);
    expect(metricDefinition("engagementDelta")!.definition).toMatch(/percentage POINTS/);
  });

  it("says of BOTH deltas that an absent one means no prior window, not no change", () => {
    // ⚠️ `delta === null` MEANS NO PRIOR WINDOW EXISTS (all time), and both
    // render sites drop the chip entirely rather than draw "0%". A definition
    // that let a reader read absence as "unchanged" would contradict the ⚠️
    // comments in kpi-cards.tsx and engagement-chart.tsx.
    for (const key of ["kpiDelta", "engagementDelta"]) {
      expect(metricDefinition(key)!.definition, key).toMatch(/no prior window/i);
    }
    expect(metricDefinition("kpiDelta")!.definition).toMatch(/not the same as no change/i);
  });

  it("records that “Shares” is the data’s “reposts”, so nobody hunts for a missing column", () => {
    expect(metricDefinition("Shares")!.definition).toMatch(/reposts/i);
  });

  it("says the per-post rate is published, never derived", () => {
    // Pins `columns.tsx`'s ⚠️: ArcBase could compute a rate from interactions and
    // impressions and deliberately does not.
    expect(metricDefinition("engagementRatePerPost")!.definition).toMatch(/never derives/i);
  });
});

describe("an unmapped metric", () => {
  it("returns undefined rather than a guess", () => {
    // ⚠️ The render sites branch on exactly this. `undefined` must reach them so
    // they can draw NO ⓘ; an empty-string fallback here would produce an ⓘ that
    // opens onto nothing.
    expect(metricDefinition("Reach")).toBeUndefined();
    expect(metricDefinition("")).toBeUndefined();
  });

  it("does not resolve inherited Object properties as definitions", () => {
    // `Record` lookups are famously happy to hand back `toString`.
    expect(metricDefinition("toString")).toBeUndefined();
    expect(metricDefinition("constructor")).toBeUndefined();
  });
});

describe("the server/client boundary this module straddles", () => {
  it('keeps metric-definitions.ts free of "use client"', () => {
    // Read by the ⓘ (a Client Component) and by service-level tests. A directive
    // would turn every export into a client reference — the defect
    // `src/rsc-boundary.test.ts` exists to catch repo-wide.
    const source = readFileSync(join(process.cwd(), MODULE), "utf8");

    expect(source).not.toMatch(/^\s*["']use client["']/m);
  });

  it("reads the module it is guarding", () => {
    const source = readFileSync(join(process.cwd(), MODULE), "utf8");

    expect(source).toContain("export const METRIC_DEFINITIONS");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE VOCABULARY BOUNDARY — a Client reads all THREE of these panels, so none of
// them may explain a figure in the language of the machinery that produced it.
//
// Key performance (7) · the Report status strip (6) · the Outreach summary (8).
// All three render on `/r/[token]`, so all three are covered here. The strip and
// the summary arrived after the first pass and carried the same leak — which is
// why this guard is driven from the MAPS rather than from a list of labels
// someone has to remember to extend.
//
// ⚠️ THIS IS ABOUT VOCABULARY, NEVER ABOUT CAVEATS. Every qualification in these
// sentences was earned: figures marked approximate are approximate, a blank is
// not a zero, a point-in-time count is not a total. The rule below forbids
// naming HOW the data arrived — uploads, scrapes, views, schemas — and forbids
// nothing else. A sentence made friendlier by dropping "approximate", or by
// letting a blank read as a zero, is a fabricated figure written in prose, which
// is worse than any amount of clumsiness.
//
// The words are ArcBase's own pipeline nouns. To the staff member who performs
// an upload they are exactly right, which is why the staff-only definitions
// (engagement-rate reconciliation, the KPI deltas, outreach, posts) still use
// them and MUST keep using them. To the Client reading their own report they
// name nothing, and a figure explained by an unfamiliar internal process reads
// as a figure being apologised for.
// ─────────────────────────────────────────────────────────────────────────────

describe("the definitions a CLIENT reads name no part of the pipeline", () => {
  /**
   * ArcBase's ingestion vocabulary — true words, wrong audience.
   *
   * ⚠️ ONLY THE UNAMBIGUOUS NOUNS. "row", "table" and "view" are deliberately NOT
   * here: on these sentences they mean the on-screen matrix row, the rendered
   * table and "the posts in this view" — ordinary UI words a Client reads
   * correctly. Forbidding them caught `reportTotalPosts`' "the two rows beneath
   * them", which is exactly right as written. The cost is that a genuine
   * "the reporting view's figure" would slip past this guard on a client-visible
   * sentence; that residual is stated rather than papered over.
   */
  const PIPELINE =
    /\b(uploads?|uploaded|scrapes?|scraped|scraper|schemas?|ingest\w*|pipelines?|RPC|Supabase)\b/i;

  /** Every label map a Client's own report renders an ⓘ from. */
  const CLIENT_MAPS = {
    "Key performance": REPORT_METRIC_KEYS,
    "Report status": REPORT_STATUS_METRIC_KEYS,
    "Outreach summary": OUTREACH_SUMMARY_METRIC_KEYS,
  } as const;

  it("covers exactly the labels those panels actually map, so it cannot pass vacuously", () => {
    // Driven from the real maps: a label added to one is covered here the same
    // day, and a shrunken map fails rather than quietly testing less.
    expect(Object.keys(REPORT_METRIC_KEYS).sort()).toEqual([
      "Avg interactions",
      "Avg interactions per 1K followers",
      "Connections",
      "Monthly avg",
      "Monthly max",
      "Total interactions",
      "Total posts",
    ]);
    expect(Object.keys(REPORT_STATUS_METRIC_KEYS)).toHaveLength(6);
    expect(Object.keys(OUTREACH_SUMMARY_METRIC_KEYS)).toHaveLength(8);
    // Every mapped key must actually resolve, or the sweep below reads undefined
    // and passes on a definition that does not exist.
    for (const [panel, map] of Object.entries(CLIENT_MAPS)) {
      for (const [label, key] of Object.entries(map)) {
        expect(METRIC_DEFINITIONS[key]?.definition, `${panel} → ${label}`).toBeTruthy();
      }
    }
  });

  it("says nothing about uploads, scrapes, schemas or ingestion", () => {
    const leaks = Object.entries(CLIENT_MAPS).flatMap(([panel, map]) =>
      Object.entries(map)
        .map(([label, key]) => ({
          label,
          panel,
          hit: PIPELINE.exec(METRIC_DEFINITIONS[key].definition),
        }))
        .filter(({ hit }) => hit !== null)
        .map(({ panel: p, label, hit }) => `${p} → ${label}: “${hit![0]}”`),
    );

    expect(leaks).toEqual([]);
  });

  it("still carries every caveat those sentences were carrying before", () => {
    // ⚠️ THE OTHER HALF OF THE RULE, AND THE HALF THAT MATTERS MORE. Rewriting
    // for a Client is only safe while the claims survive intact, so the three
    // qualifications most easily lost to a friendlier sentence are pinned here.
    const connections = METRIC_DEFINITIONS.connections.definition;
    const perThousand = METRIC_DEFINITIONS.reportPerThousandFollowers.definition;

    // A point-in-time count is not a total, and its source may lag the rest.
    expect(connections).toMatch(/point-in-time/i);
    expect(connections).toMatch(/not a total over any period/i);
    expect(connections).toMatch(/older than the most recent data/i);
    // A blank is a blank. This one is stated MORE explicitly than it used to be.
    expect(connections).toMatch(/does not mean zero/i);

    // Approximate stays approximate, and says WHY it is approximate.
    expect(perThousand).toMatch(/approximate/i);
    expect(perThousand).toMatch(/single moment/i);
    expect(perThousand).toMatch(/not measured over the same span/i);
    expect(perThousand).toMatch(/never a zero/i);
  });

  it("keeps the Report status strip's three hardest caveats intact", () => {
    // ⚠️ THESE THREE SENTENCES LOST THE WORDS "upload" AND "scraped" ON
    // 2026-08-13, AND NOTHING ELSE. Each carries a distinction a friendlier
    // rewrite would quietly flatten, so each is pinned to the claim rather than
    // to the wording that happens to carry it today.
    const currentAsOf = METRIC_DEFINITIONS.statusCurrentAsOf.definition;
    const trackedSince = METRIC_DEFINITIONS.statusTrackedSince.definition;
    const mostRecent = METRIC_DEFINITIONS.statusMostRecentPost.definition;

    // Freshness is NOT the newest post's date — the single most misread thing
    // on the strip, and the reason this sentence exists at all.
    expect(currentAsOf).toMatch(/NOT the date of the most recent post/);
    expect(currentAsOf).toMatch(/newest post in it is older/i);
    // A dash is an absent date, not a zero and not "today".
    expect(currentAsOf).toMatch(/dash means no date is on record/i);

    // Before this date nothing was captured: OUTSIDE the figures, not missing
    // from them. Those are different claims and the weaker one would be false.
    expect(trackedSince).toMatch(/never captured/i);
    expect(trackedSince).toMatch(/outside these figures rather than missing from them/i);

    // Undated posts cannot be the answer here, yet are still counted elsewhere —
    // dropping the second half would read as though they had been discarded.
    expect(mostRecent).toMatch(/whole elapsed days/i);
    expect(mostRecent).toMatch(/cannot be the answer here/i);
    expect(mostRecent).toMatch(/still counted in/i);
  });

  it("leaves the STAFF definitions in staff vocabulary, where it is the right word", () => {
    // Guard against an over-eager sweep: these are read by the people who run
    // the ingestion, and "scrape" is precisely what they need to see.
    expect(METRIC_DEFINITIONS.rateReconciliation.definition).toMatch(PIPELINE);
    expect(METRIC_DEFINITIONS.followers.definition).toMatch(PIPELINE);
  });
});
