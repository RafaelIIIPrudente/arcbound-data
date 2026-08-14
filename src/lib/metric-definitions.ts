// ─────────────────────────────────────────────────────────────────────────────
// WHAT EVERY FIGURE ON THE DASHBOARD ACTUALLY MEASURES.
//
// ⚠️ THIS MODULE MUST NOT CARRY "use client". It is read by Client Components
// (the ⓘ trigger) AND asserted against by service tests, so a directive here
// would turn every export into a client reference — see `report-period.ts` and
// `src/rsc-boundary.test.ts` for what that costs.
//
// ⚠️ "ENGAGEMENT RATE" NAMES FOUR DIFFERENT STATISTICS IN THIS APP, and that is
// the defect these definitions exist to resolve — not the missing tooltips. The
// dashboard's rate, the posts table's rate, the comparison table's per-client
// rate and its median row all render under one label and are four different
// numbers. Each gets its OWN key below, and each sentence says WHICH ONE it is,
// because a definition written without noticing the collision would document the
// ambiguity more confidently rather than resolve it.
//
// ⚠️ A DEFINITION MUST BE TRUE OF THE CODE THAT COMPUTES IT, not approximately
// true. These sentences are checked against `analytics.ts` by
// `metric-definitions.test.ts`, including a coverage test that FAILS if the
// service starts emitting a KPI nobody has defined. If a metric's meaning is not
// clear from the source, it belongs out of this record entirely — an absent ⓘ is
// honest, and a confident wrong sentence is a fabricated figure in prose.
// ─────────────────────────────────────────────────────────────────────────────

export interface MetricDefinition {
  /**
   * What the SCREEN calls this measurement — used for the ⓘ trigger's accessible
   * name and the popover's heading.
   *
   * ⚠️ NOT UNIQUE, AND DELIBERATELY SO. Three keys below carry the term
   * "Engagement rate" because three screens genuinely print that label. The KEY
   * disambiguates; the term is what the reader sees.
   */
  term: string;
  /** One sentence-or-two, true of the formula. */
  definition: string;
}

/**
 * Metric key → its definition.
 *
 * The six KPI keys are the LABELS `buildDashboardAnalytics` emits, so the
 * coverage test can drive this record from the service's real output rather than
 * from a hand-copied list.
 */
export const METRIC_DEFINITIONS = {
  // ── the KPI cards (labels emitted by `buildDashboardAnalytics`) ────────────
  Impressions: {
    term: "Impressions",
    definition:
      "How many times posts in the selected window were seen. It is the total across every post in the window, not an average per post.",
  },
  Posts: {
    term: "Posts",
    definition:
      "How many posts fall inside the selected window. Every other figure on this screen is computed from exactly this set of posts.",
  },
  Likes: {
    term: "Likes",
    definition: "Total likes across every post in the selected window.",
  },
  Comments: {
    term: "Comments",
    definition: "Total comments across every post in the selected window.",
  },
  Shares: {
    term: "Shares",
    definition:
      "Total shares across every post in the selected window. The underlying data column is named “reposts” — ArcBase says “Shares” on every screen, so there is no separate reposts figure to go looking for.",
  },
  Saves: {
    term: "Saves",
    definition: "Total saves across every post in the selected window.",
  },

  // ── the four rates that share one label ────────────────────────────────────
  engagementRateWindow: {
    term: "Engagement rate",
    definition:
      "Total interactions divided by total impressions across the whole window, as a percentage. It is weighted by impressions rather than being the average of the individual posts’ rates — averaging would give a post seen 12 times the same say as one seen 100,000 times.",
  },
  engagementRatePerPost: {
    term: "Engagement rate",
    definition:
      "This one post’s engagement rate, exactly as the source data published it. ArcBase never derives it — a post the source left blank shows a dash rather than a computed stand-in. It is a per-post figure, so it will not average out to the dashboard’s window-wide rate, which is a ratio of totals.",
  },
  engagementRatePerClient: {
    term: "Engagement rate",
    definition:
      "One client’s interactions divided by their impressions in the selected window, as a percentage — the dashboard’s rate computed over that client’s posts alone. Blank means their posts drew no impressions at all, which is “not applicable” rather than 0%.",
  },
  engagementRateMedianAcrossClients: {
    term: "Median engagement rate",
    definition:
      "The middle value of the per-client engagement rates in the column above, counted only over clients that have one. Half sit above it and half below. It is a median across clients, so it is not the book’s overall rate and will not equal the dashboard figure.",
  },

  // ── the rest of the client comparison table ────────────────────────────────
  comparisonPosts: {
    term: "Posts",
    definition:
      "How many of this client’s posts fall inside the selected window. It is the sample size every averaged figure in their row is computed from, and it is always a real number — a registered client who published nothing scores 0, which is a finding rather than a gap.",
  },
  avgImpressions: {
    term: "Avg impressions",
    definition:
      "This client’s total impressions in the window divided by how many posts they published — a mean per post. Blank means they published nothing in the window, which is not the same as averaging zero.",
  },
  followers: {
    term: "Followers",
    definition:
      "The most recent follower count recorded on an upload for this client. Uploads that recorded no count are skipped rather than read as zero, so this is the newest figure anyone actually captured — not necessarily the figure from the newest upload. Blank means no upload has ever recorded one.",
  },
  interactionsPer1K: {
    term: "Per 1K followers",
    definition:
      "This client’s interactions in the window divided by their follower count, times 1,000 — interactions per thousand followers, which lets clients of different sizes be compared. Blank when they published nothing in the window, or when no follower count has been recorded; it is never computed against an audience of zero.",
  },
  connections: {
    term: "Connections",
    definition:
      "The most recent connection count on record. It is captured separately from Followers, so one can be present without the other. It is a point-in-time count — a figure from a single moment, not a total over any period — and the record it comes from may be older than the most recent data elsewhere in this report. It is shown as a plain count, with no per-1,000 figure beside it. Blank means none has ever been recorded, which is the ordinary case; it does not mean zero.",
  },

  // ── the Client List's two adjacent columns, which are two PIPELINES ────────
  //
  // ⚠️ THESE TWO SENTENCES EXIST BECAUSE THE COLUMNS ARE ADJACENT. Nothing on
  // that screen is wrong: `Last ArcBase upload` reads `public.uploads` (this
  // app's own `/upload`) and `Posts` reads `bi.linkedin_post_latest` (the
  // external pipeline). Side by side under two bare labels, "Never" beside a
  // real post count reads as a contradiction, and a reviewer filed it as one —
  // correctly, because the screen was saying the wrong thing with true numbers.
  // The fix is entirely in the words: each sentence names its OWN source and
  // states that the other column is not measuring it.
  //
  // ⚠️ STAFF VOCABULARY IS CORRECT HERE AND MUST STAY. "Upload", "ingest" and
  // "pipeline" are the words the people who perform uploads use, and naming the
  // pipeline is the fix rather than a leak. Their key map is deliberately NOT
  // one of the three client-visible maps — see `CLIENT_LIST_METRIC_KEYS`.
  clientListLastArcbaseUpload: {
    term: "Last ArcBase upload",
    definition:
      "When a file was last ingested for this client through ArcBase's own upload page. It measures nothing else — posts reach the reporting data through a separate external pipeline, so a client can read “Never” here and still have a Posts count beside it. The two columns describe two different pipelines and neither one contradicts the other. “Never” is a known fact, not missing data: nobody has ever uploaded a file for this client here. A dash is a third case again — the upload history could not be read at all.",
  },
  clientListPosts: {
    term: "Posts",
    definition:
      "How many posts the reporting data attributes to this client. It arrives from the external pipeline rather than from ArcBase's uploads, so it is independent of the column beside it and the two are expected to disagree. Attribution is by name match, so a client whose name is recorded differently upstream than it is registered here will be under-counted — and an under-counted client looks exactly like one who posted less. A dash means the count could not be read, which is never a zero.",
  },

  // ── the client LinkedIn report → Key performance ───────────────────────────
  //
  // ⚠️ THE HERO ROW IS THE SELECTED PERIOD; THE TWO ROWS BENEATH IT ARE ALL-TIME.
  // That split is the single most misreadable thing on the section — "26 total
  // posts" above "monthly max 26" invites the reading that they are the same
  // claim — so every sentence below names its own span explicitly.
  reportTotalPosts: {
    term: "Total posts",
    definition:
      "How many posts fall inside the SELECTED period — the one named by the caption and the picker above. The three large figures are all scoped to that period; the two rows beneath them are all-time, which is why a number can repeat across them without anything being wrong.",
  },
  reportAvgInteractions: {
    term: "Avg interactions",
    definition:
      "The mean interactions per post across the SELECTED period only. Its all-time counterpart is “Avg interactions per post” in the Monthly avg row below, and the two differ whenever this period ran hotter or cooler than the long-run norm — which is the comparison this figure exists to allow.",
  },
  reportTotalInteractions: {
    term: "Total interactions",
    definition:
      "Total interactions across the posts in the selected period. It is the source’s own interactions figure summed — never likes, comments and shares added together, because the source may count things those three do not, and a derived total that disagreed with the panels below would discredit the report.",
  },
  reportMonthlyAvg: {
    term: "Monthly avg",
    definition:
      "Across the ENTIRE posting history, not the selected period: posts per month, interactions per post, and interactions per month. The two per-month rates divide by the number of calendar months from the first post to the last, and months with no posts still count in that span — so they are rates over elapsed time, not averages of their active months. They also count only posts carrying a publish date, because a post with no date belongs to no month; those posts are still in the totals above and in the per-post figure beside these, which involve no month.",
  },
  reportMonthlyMax: {
    term: "Monthly max",
    definition:
      "The single best calendar month in the entire posting history — the most posts in one month, and the most interactions in one month. The two are found independently, so they need not be the same month. There is no per-post figure because a maximum has no rate; the dash says that rather than showing a 0 that would assert something untrue.",
  },
  reportPerThousandFollowers: {
    term: "Avg interactions per 1K followers",
    definition:
      "The all-time average interactions per post divided by the follower count, times 1,000. It is marked approximate for a real reason: it pairs a long-run per-post average with a follower count captured at a single moment, so the two halves are not measured over the same span. Blank when no follower count has ever been recorded — never a zero.",
  },

  // ── the rate reconciliation panel (Data quality) ───────────────────────────
  rateReconciliation: {
    term: "Engagement rate reconciliation",
    definition:
      "Three different sources state an engagement rate: the scraper’s figure, the reporting view’s figure, and the way the dashboard works one out for a whole period. This panel reports where those definitions disagree so someone can ask the data’s owner why. It never averages them and never declares a winner.",
  },
  postsMissingRate: {
    term: "Posts with no rate",
    definition:
      "How many of the posts read carry no engagement rate from the reporting view at all, out of every post considered. A missing rate is not a rate of zero, and it is not counted as a disagreement below.",
  },
  ratesThatDiffer: {
    term: "Rates that differ",
    definition:
      "How many posts carry BOTH the scraper’s rate and the reporting view’s rate and the two do not match, out of the posts where both figures exist. Posts missing either one are not comparable, so they are excluded rather than counted as agreeing. If the sentence below says the two are on different scales, every difference counted here is a question about units rather than about the numbers.",
  },
  matchesOverallFormula: {
    term: "Matches our overall formula",
    definition:
      "Whether the reporting view works out a post’s rate the same way the dashboard works out a rate for a whole period — interactions divided by impressions. A post can only be checked if it has a rate, a recorded interaction count and at least one impression, so “—” means no post met all three and the check could not run. A count means that many of the checkable posts differ, which sizes the finding rather than declaring the pipeline broken.",
  },

  // ── the Client Overview tab ────────────────────────────────────────────────
  //
  // ⚠️ EACH SENTENCE COVERS ITS CARD'S FIGURE AND THE CHANGE BESIDE IT, because
  // on this tab the two are not always the same measurement — see Posts.
  overviewUploads: {
    term: "Uploads",
    definition:
      "How many times a file of this client’s post metrics has been ingested through ArcBase. A dash means the upload history could not be read — not that there have been none.",
  },
  overviewPosts: {
    term: "Posts",
    definition:
      "How many posts are attributed to this client in the reporting data. The figure beside it is NOT the change in this number: it is how many new posts the most recent upload landed, which is ArcBase’s own ingest audit. They are adjacent pipelines — attribution happens after an upload, so this count can move without an upload and an upload can land rows without moving it.",
  },
  overviewFollowers: {
    term: "Followers",
    definition:
      "The follower count captured with the most recent upload that recorded one. The figure beside it is the change from the previous upload that recorded a count — uploads that captured none are skipped rather than read as zero, so the comparison is always between two real measurements. A dash means no upload has ever carried a follower count.",
  },
  overviewConnections: {
    term: "Connections",
    definition:
      "The connection count captured with the most recent upload that recorded one, read the same way as Followers but captured independently — a scrape can record one without the other. A dash is the ORDINARY case here: the count is optional at capture and uploads predating the column carry none. It never softens to 0.",
  },

  // ── the Outreach system tab ────────────────────────────────────────────────
  outreachProspects: {
    term: "Prospects",
    definition:
      "How many prospect rows this snapshot holds. It is the snapshot’s own size rather than a column, and every funnel count beside it is a subset of it. An outreach upload is an immutable snapshot, so this is the roster exactly as it stood when that export was taken — a prospect deleted from the source sheet since then is still counted here.",
  },

  // ── the Client's own report → the Report status strip ──────────────────────
  //
  // ⚠️ VOICE-NEUTRAL, LIKE EVERY REPORT DEFINITION. These are read by the CLIENT
  // on `/r/[token]` as well as by staff, so they say "the posting history" and
  // never "this client's" or "your".
  statusCurrentAsOf: {
    term: "Current as of",
    definition:
      "The date of the most recent data recorded for this report — NOT the date of the most recent post. It says how current the figures are, so a report can hold recently recorded data while the newest post in it is older. A dash means no date is on record.",
  },
  statusTrackedSince: {
    term: "Tracked since",
    definition:
      "The date this report's records begin. Activity before it was never captured, so it is outside these figures rather than missing from them.",
  },
  statusMostRecentPost: {
    term: "Most recent post",
    definition:
      "The publish date of the newest post in this view that carries one, and how long ago that was in whole elapsed days. Posts that arrived without a usable publish date cannot be the answer here — they are still counted in “Posts in this view”, which discloses how many there are.",
  },
  statusPostsInView: {
    term: "Posts in this view",
    definition:
      "How many posts fall inside the reporting period. When some carry no publish date the split is stated beside the total: undated posts count here but cannot be placed on a timeline, so the rhythm and trend figures are drawn from the dated ones only.",
  },
  statusPostingRhythm: {
    term: "Posting rhythm",
    definition:
      "Dated posts divided by the time between the FIRST and LAST of them — the rhythm while active, not measured up to today. A run of steady posting followed by silence keeps its rhythm here, and the silence is carried by “Most recent post” instead. Absent when there are fewer than two dated posts, or when they all fall on a single day: there is no span to divide by, which is not the same as a rhythm of zero.",
  },
  statusImpressionsTrend: {
    term: "Impressions trend",
    definition:
      "Compares the FIRST and LAST points of the impressions chart and names the direction between them: up or down only when they differ by more than 5%, otherwise holding steady. It is a direction, not a verdict — it reads only those two endpoints, so it says nothing about what happened in between. Absent when there are fewer than two points to compare.",
  },

  // ── the Client's own report → the Outreach summary ─────────────────────────
  //
  // ⚠️ AGGREGATE COUNTS ONLY (ADR 0012). No prospect name, URL, message, note,
  // stage or email address crosses this boundary, and no definition here may
  // describe one. Each rule mirrors the funnel rule the staff tab counts by, so
  // the two surfaces cannot come to disagree about what a figure means.
  publicOutreachProspects: {
    term: "Prospects",
    definition:
      "How many people were on the outreach list in the most recent snapshot taken for this report. Every figure beside it counts a subset of these people. A snapshot is a fixed record of the list exactly as it stood at that moment, so it does not change afterwards.",
  },
  publicRequestsSent: {
    term: "Requests sent",
    definition:
      "How many of those prospects have a value recorded against the date a connection request was sent to them.",
  },
  publicConnectionsAccepted: {
    term: "Connections accepted",
    definition:
      "How many prospects show a connection status of Connected. It is recorded separately from the outreach steps around it rather than inferred from them.",
  },
  publicReplies: {
    term: "Replies",
    definition:
      "How many prospects answered — any recorded reply other than “no reply”. A blank counts as NO reply rather than as a reply: nobody having written anything down is not evidence that somebody answered. An answer nobody could categorise still counts, because somebody did reply.",
  },
  publicMeetingsBooked: {
    term: "Meetings booked",
    definition:
      "How many prospects have a meeting date recorded against the LinkedIn channel. It is stated even at zero, so an empty figure is a reported result rather than a missing one.",
  },
  publicEmailsSent: {
    term: "Emails sent",
    definition:
      "How many prospects have a value recorded against the date they were emailed. The Email figures are a separate channel from the LinkedIn ones above and are never added to them.",
  },
  publicEmailReplies: {
    term: "Email replies",
    definition:
      "How many prospects answered by email — any recorded reply other than “no reply”, read exactly as the LinkedIn Replies figure is. A blank is not a reply.",
  },
  publicEmailMeetingsBooked: {
    term: "Email meetings booked",
    definition:
      "How many prospects have a meeting date recorded against the Email channel. Someone reached on both channels can appear here and in the LinkedIn figure — the Combined meetings figure below counts each person once.",
  },

  // ── the report's charts and panels (staff report AND the Client's own) ─────
  //
  // ⚠️ ONE DEFINITION PER PANEL, NOT PER BAR. Every chart card already carries a
  // scope badge stating its period and how many posts it rests on, so what a
  // reader still cannot see is the RULE behind a bar — what is averaged, and
  // what an empty one means.
  chartImpressionsOverTime: {
    term: "Average impressions over time",
    definition:
      "The average impressions of the posts published in each bar's stretch of time, across the selected period. The bars are weeks for a single-month period and months for longer ones — the heading says which, because a month period drawn by month would be one bar. The dashed line is the average across the whole period, computed from the same posts the bars are. A gap is a stretch with no posts at all, which is not the same as posts that got no reach — a zero-height bar would claim the second.",
  },
  chartImpressionsByWeekday: {
    term: "Average impressions by day of week posted",
    definition:
      "The average impressions of posts grouped by the weekday they went out, Sunday through Saturday. Only posts with a resolvable publish date can be placed on a weekday; the count beside the heading says how many that is, and any undated posts are disclosed rather than assigned to a day.",
  },
  chartInteractionsByAsset: {
    term: "Average interactions by asset type",
    definition:
      "The average interactions of the posts of each asset type — image, video, text and so on — within the selected period. It is a per-post average, so a type with one strong post can top the chart; the post count beside the heading is what tells you how much weight to give it.",
  },
  chartPostTypeDistribution: {
    term: "Post type distribution",
    definition:
      "What share of the posts in the selected period were of each asset type, as a percentage. It counts posts and nothing else — no engagement is involved, so a large share means a lot was published in that format, never that the format performed well.",
  },
  panelInteractionsComparison: {
    term: "Interactions comparison",
    definition:
      "The same interaction figures side by side for the selected period, the three months before it, and the whole history — so a period can be read against its own recent past and its long-run context rather than in isolation. When the selected period IS the whole history, the two identical rows are collapsed into one rather than printed twice.",
  },
  panelPostingCadence: {
    term: "Posting cadence",
    definition:
      "The rhythm of publishing across the selected period: how many posts, how often, and the gaps between them. Only posts with a resolvable publish date can be placed on the timeline — an undated post is counted in the total but never dropped onto a date it was not known to have, because that would invent a rhythm.",
  },
  panelContentComposition: {
    term: "Content composition",
    definition:
      "What the posts in this period were MADE OF — their length, and how often they asked a question, linked out, mentioned someone or used emoji. Every figure is a plain frequency: no engagement is involved, nothing is ranked, and no feature is called effective. A “0 of 12” is a real count of something not used; a dash means no post carried text to analyse at all.",
  },

  // ── the two deltas, which are different units ──────────────────────────────
  kpiDelta: {
    term: "Change vs. prior period",
    definition:
      "Percent change against the previous window of equal length, shown as a size with ▲ or ▼ for direction. ▲100% means the previous window had none of this and this one has some — it grew from nothing. No chip at all means there is no prior window to compare against (all time), which is not the same as no change.",
  },
  engagementDelta: {
    term: "Change in engagement rate",
    definition:
      "The gap between this window’s engagement rate and the previous equal-length window’s, in percentage POINTS — 4.0% against a prior 2.8% is +1.2pt, not +43%. No figure at all means there is no prior window to compare against.",
  },
} as const satisfies Record<string, MetricDefinition>;

export type MetricKey = keyof typeof METRIC_DEFINITIONS;

/**
 * The client report's Key Performance labels → their definition keys.
 *
 * ⚠️ A LOOKUP TABLE RATHER THAN "USE THE LABEL AS THE KEY", WHICH IS WHAT THE
 * DASHBOARD KPIs DO. Two of these labels collide with other screens: the report
 * says "Total posts" where the dashboard says "Posts", and it says "Connections"
 * for the SAME measurement the comparison table shows — so "Connections" maps to
 * the shared key (one measurement, one sentence) while the rest get report-
 * specific ones that name the report's own spans.
 *
 * ⚠️ THE REPORT'S FIGURE LABELS COME FROM THE SERVICE, so this map can fall
 * behind it. `key-performance.test.tsx` drives the map from a REAL
 * `buildClientReport` result and fails if a label appears with no entry.
 */
export const REPORT_METRIC_KEYS: Record<string, MetricKey> = {
  // The hero row — the SELECTED period.
  "Total posts": "reportTotalPosts",
  "Avg interactions": "reportAvgInteractions",
  "Total interactions": "reportTotalInteractions",
  // The matrix rows — ALL TIME. Keyed by ROW, not by cell: one sentence covering
  // a row's three figures reads better than six ⓘ crowded into numeric cells,
  // and it is the only place the em dash in the maxima row can be explained.
  "Monthly avg": "reportMonthlyAvg",
  "Monthly max": "reportMonthlyMax",
  // The two footer lines.
  "Avg interactions per 1K followers": "reportPerThousandFollowers",
  Connections: "connections",
};

/**
 * The Report status strip's labels → their definition keys.
 *
 * Separate from `REPORT_METRIC_KEYS` because the two panels are keyed by
 * different label sets and share none: a single map would let a label added to
 * one silently resolve against the other's entry.
 */
export const REPORT_STATUS_METRIC_KEYS: Record<string, MetricKey> = {
  // ⚠️ "Reporting period" IS DELIBERATELY ABSENT. Its ⓘ would be announced as
  // "What is Reporting period?", which collides with the period PICKER's own
  // accessible name a few lines above it on the same screen — two controls
  // named around one phrase, where a screen-reader user could not tell which
  // they had found. The block is also the one label on this strip that needs no
  // explaining: it simply echoes the picker's current value.
  "Current as of": "statusCurrentAsOf",
  "Tracked since": "statusTrackedSince",
  "Most recent post": "statusMostRecentPost",
  "Posts in this view": "statusPostsInView",
  "Posting rhythm": "statusPostingRhythm",
  "Impressions trend": "statusImpressionsTrend",
};

/**
 * The Outreach summary's figure labels → their definition keys.
 *
 * ⚠️ "Combined meetings" IS DELIBERATELY ABSENT. That figure already carries a
 * full sentence beneath it on screen ("…people booked a meeting on LinkedIn,
 * Email, or both — not a sum of the two figures above"), and an ⓘ repeating it
 * would be a second copy of prose this repo keeps in one place. An unmapped
 * label renders no ⓘ, which is exactly the right outcome here.
 */
export const OUTREACH_SUMMARY_METRIC_KEYS: Record<string, MetricKey> = {
  Prospects: "publicOutreachProspects",
  "Requests sent": "publicRequestsSent",
  "Connections accepted": "publicConnectionsAccepted",
  Replies: "publicReplies",
  "Meetings booked": "publicMeetingsBooked",
  "Emails sent": "publicEmailsSent",
  "Email replies": "publicEmailReplies",
  "Email meetings booked": "publicEmailMeetingsBooked",
};

/**
 * The Client List's column headers → their definition keys.
 *
 * ⚠️ A FOURTH MAP, AND DELIBERATELY NOT ONE OF THE THREE ABOVE. Those three are
 * the maps a CLIENT's own report renders from, and `metric-definitions.test.ts`
 * sweeps every definition reachable through them for ArcBase's ingestion
 * vocabulary — "upload", "scrape", "pipeline" — because those words name steps a
 * Client never sees.
 *
 * `/clients` is a STAFF screen, and its two sentences must use exactly those
 * words: the defect they fix is that two columns drawn from two pipelines sit
 * adjacent under labels that never say so. Folding these keys into any of the
 * three maps would put staff vocabulary on a Client's screen AND fail the
 * sweep — which is the correct outcome, and the reason this map is separate
 * rather than the reason to loosen the sweep.
 */
export const CLIENT_LIST_METRIC_KEYS: Record<string, MetricKey> = {
  "Last ArcBase upload": "clientListLastArcbaseUpload",
  Posts: "clientListPosts",
};

/**
 * The definition for a key, or `undefined` when there is none.
 *
 * ⚠️ `undefined` IS THE ANSWER FOR AN UNMAPPED METRIC, and the render site must
 * show NO ⓘ rather than an empty popover or a guess. A metric this record does
 * not know is one nobody has written a true sentence for yet.
 */
export function metricDefinition(key: string): MetricDefinition | undefined {
  // ⚠️ `Object.hasOwn` FIRST, NOT A BARE LOOKUP. A plain object inherits from
  // `Object.prototype`, so `record["toString"]` hands back a FUNCTION — which is
  // truthy, reaches the render site, and draws an ⓘ that opens onto `[Function]`.
  if (!Object.hasOwn(METRIC_DEFINITIONS, key)) return undefined;
  return (METRIC_DEFINITIONS as Record<string, MetricDefinition>)[key];
}
