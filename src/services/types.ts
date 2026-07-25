export type CustomerStatus = "active" | "blocked" | "pending";

export interface Customer {
  id: string;
  name: string;
  email: string;
  company: string;
  status: CustomerStatus;
  /** ISO 8601 date string. */
  createdAt: string;
}

export interface Client {
  id: string;
  name: string;
  /** Normalized LinkedIn profile URL — the Client's identity (see lib/linkedin-url). */
  linkedin_url: string;
  /** ISO 8601 date string. */
  createdAt: string;
  /**
   * Posts attributed to this Client in `bi.linkedin_post_latest`.
   *
   * ⚠️ `null` means the count could NOT BE READ — it is not a zero. A real `0`
   * (the read succeeded and found nothing) and a failed read used to collapse
   * into the same `0`, which rendered a broken pipeline and a brand-new client
   * identically. The UI must keep them apart.
   *
   * CEILING: this separates read-failed from zero, and nothing more. A real `0`
   * can still mean either "this Client has never posted" or "the downstream
   * name-match attributed nothing to them" — attribution happens outside
   * ArcBase (ADR 0009), so we cannot see which, and must not claim to.
   */
  postsCount: number | null;
}

/**
 * When a Client was last ingested:
 *   • an ISO 8601 string — the newest upload's timestamp
 *   • `null`             — the read SUCCEEDED and this Client has never been ingested
 *   • `"unavailable"`    — the uploads read FAILED, so we do not know
 *
 * Three states because "never ingested" and "we could not find out" are
 * different facts, and a table that shows both as the same glyph is lying.
 */
export type LastUpload = string | null | "unavailable";

/**
 * A Client as the LIST screen shows it: the entity plus its newest ingest.
 *
 * Separate from `Client` on purpose — `lastUpload` is a list-screen concern,
 * and folding it into the entity would force `getClient` to make an uploads
 * round-trip that the detail page already makes for itself.
 */
export interface ClientListRow extends Client {
  lastUpload: LastUpload;
}

export interface Paginated<T> {
  items: T[];
  total: number;
}

// ── Dashboard analytics ──────────────────────────────────────────────────────
// Read-model for the analytics dashboard (route `/`). Mock-derived today.

export type DashboardRange = "7d" | "30d" | "90d";

export interface Kpi {
  label: string;
  value: number;
  /** Optional unit appended to the value (e.g. "%"); most KPIs have none. */
  unit?: string;
  /** Change magnitude vs. the prior period (percent). */
  delta: number;
  direction: "up" | "down";
}

export interface SeriesPoint {
  /** X-axis period label (e.g. "Wk 1", "Mon"). */
  label: string;
  value: number;
}

export interface RecentPost {
  id: string;
  snippet: string;
  date: string;
  /** Post format type — optional; the BI view doesn't expose it. */
  format?: string;
  impressions: number;
  likes: number;
  comments: number;
}

/**
 * How short a truncated read came, in the reader's own numbers.
 *
 * Shared by every seam that can come back short — the dashboard, the Client
 * report and the posts table — so the three screens describe the same situation
 * in the same terms.
 *
 * ⚠️ ONE FIELD, NOT A BOOLEAN PLUS TWO NUMBERS. A separate `truncated` flag
 * alongside these could disagree with them; here the presence of the object IS
 * the flag, so there is nothing to keep in step.
 */
export interface ReadTruncation {
  /** Rows actually read. */
  read: number;
  /** Rows matching the query, or `null` when the server reported no count. */
  total: number | null;
}

export interface DashboardAnalytics {
  totalPosts: number;
  lastSync: string;
  hero: Kpi;
  kpis: Kpi[];
  engagement: { value: number; delta: number };
  impressionsSeries: SeriesPoint[];
  engagementSeries: SeriesPoint[];
  /**
   * Average impressions by the weekday a post was PUBLISHED on, Sunday → Saturday.
   *
   * ⚠️ DATED BY `estimated_post_date` ALONE, undated posts EXCLUDED. Unlike every
   * other dashboard figure — which windows on `effectiveMs` and so counts hour-age
   * posts via their `scraped_at` — a weekday may not be asserted for a post whose
   * publish date was never resolved: bucketing it by its scrape weekday would pile
   * a whole weekly scrape onto one day and fabricate rhythm. Those posts are
   * counted in `weekdayUndatedPosts` instead. An empty weekday is a genuine 0.
   */
  impressionsByWeekday: SeriesPoint[];
  /**
   * Posts in the current window with NO resolved publish date, excluded from
   * `impressionsByWeekday`. Surfaced (not hidden) so the chart can disclose the
   * exclusion; the datable count it averaged is `totalPosts − weekdayUndatedPosts`.
   */
  weekdayUndatedPosts: number;
  recentPosts: RecentPost[];
  /** True when the analytics source couldn't be read (distinct from "no data"). */
  unavailable?: boolean;
  /**
   * True when the read SUCCEEDED but hit the pager's page cap.
   *
   * ⚠️ NOT A WEAKER `unavailable`, AND NEVER INFERRED FROM IT. Unavailable means
   * the figures are meaningless; truncated means they are real but INCOMPLETE —
   * every number on the screen is then a lower bound, and the screen has to say
   * so rather than presenting short figures as totals.
   */
  truncation?: ReadTruncation | null;
  /**
   * Every Client side by side over the selected range.
   *
   * `null` when a single Client is selected — the screen is then about that one
   * Client and a comparison is meaningless, so it is not built and its two extra
   * reads are not issued.
   */
  comparison?: ClientComparison | null;
}

// ── Cross-client comparison ──────────────────────────────────────────────────
// ⚠️ A COMPARISON'S INTEGRITY LIVES IN ITS DENOMINATORS. Every figure below is a
// normalised one, so each carries `null` for "not applicable" rather than a 0
// that a reader would take as a measured failure to perform. A Client who did
// not post scored 0 posts; a Client whose followers were never recorded scored
// nothing at all, and those are different rows.

export interface ClientComparisonRow {
  clientId: string;
  clientName: string;
  /**
   * Posts in the window attributed to this Client. A GENUINE 0 — this Client is
   * in the registry and published nothing, which is a finding, not missing data.
   */
  posts: number;
  /** Mean impressions per post. `null` when `posts` is 0 — no posts, no mean. */
  avgImpressions: number | null;
  /**
   * The impression-weighted rate, via the ONE `weightedRate` definition.
   *
   * ⚠️ `null` — NEVER 0 — when the Client had no impressions in the window. A 0
   * would assert that people saw the posts and did not engage.
   */
  engagementRate: number | null;
  /**
   * The most recent recorded follower count from the upload audit, skipping
   * uploads that recorded none. `null` when none was ever recorded.
   */
  followers: number | null;
  /**
   * Interactions per 1,000 followers over the window — the figure that makes a
   * 40,000-follower Client and a 2,000-follower Client comparable at all.
   *
   * ⚠️ `null` when `followers` is unknown OR 0. A rate per nothing is undefined:
   * not infinite, and not zero.
   */
  interactionsPer1K: number | null;
}

/**
 * A book median and the population it was drawn from.
 *
 * ⚠️ THE COUNT IS NOT DECORATION. A median over three Clients and a median over
 * thirty are different claims, and the UI has to be able to say which it shows.
 */
export interface ComparisonMedian {
  value: number | null;
  /** Clients that had this figure at all — the median's actual denominator. */
  clients: number;
}

export interface ClientComparisonMedians {
  avgImpressions: ComparisonMedian;
  engagementRate: ComparisonMedian;
  followers: ComparisonMedian;
  interactionsPer1K: ComparisonMedian;
}

export interface ClientComparison {
  /** One row per registry Client, INCLUDING Clients with no posts in range. */
  rows: ClientComparisonRow[];
  medians: ClientComparisonMedians;
  /**
   * Posts in the window whose `client_id` matches no registry Client.
   *
   * ⚠️ COUNTED AND SURFACED, NEVER SILENTLY DROPPED. Attribution happens
   * downstream of ArcBase as a name match (ADR 0009), so this is a real and
   * expected population — and without it the rows cannot be reconciled against
   * `totalPosts`.
   */
  unattributedPosts: number;
  /**
   * The ROSTER could not be read — without Client names there are no rows to
   * show. A failed UPLOAD read no longer lands here: it degrades the two
   * follower columns only (see `followersUnavailable`) and the comparison is
   * still built.
   *
   * Distinct from an empty registry: `rows: []` with `unavailable: false` means
   * no Clients are registered, which is a fact rather than an outage.
   */
  unavailable: boolean;
  /**
   * The follower/upload read FAILED, so `followers` and `interactionsPer1K` are
   * `null` for EVERY row.
   *
   * ⚠️ NOT INFERABLE FROM THE ROWS, WHICH IS WHY IT EXISTS. An all-em-dash
   * followers column looks identical whether the read failed or simply no Client
   * has a follower figure — two different facts ("could not be read" vs "not
   * reported"). This flag lets the table say which, instead of collapsing them.
   */
  followersUnavailable: boolean;
}

// ── Ingestion ────────────────────────────────────────────────────────────────
// One scrape (CSV or pasted JSON) → Posts + an Upload summary. Mock this pass.

export type SourceType = "csv" | "json";

/**
 * The ten Post format types the LinkedIn scraper emits. Recognition is
 * case-insensitive, but ArcBase stores whatever the Scrape sent, byte-for-byte
 * (ADR 0009) — this union is the vocabulary we understand, not a storage format.
 */
export type PostFormat =
  | "IMAGE"
  | "DOCUMENT"
  | "VIDEO"
  | "TEXT"
  | "POLL"
  | "ARTICLE"
  | "SLIDE_SHOW"
  | "SHARE"
  | "INSTANT_SHARE"
  | "UNKNOWN";

/** One scraped Post metric row — the 15-column scrape shape. */
export interface PostRow {
  linkedin_post_id: string;
  urn?: string;
  post_url?: string;
  analytics_url?: string;
  post_name?: string;
  post_content?: string;
  post_date?: string;
  impressions: number;
  likes: number;
  comments: number;
  reposts: number;
  engagement_rate: number;
  /** Nullable — the scrape may omit it. */
  saves: number | null;
  /**
   * The raw format as the Scrape sent it — any casing, never rewritten. Absent,
   * unrecognised, or UNKNOWN values go to Format Review.
   */
  post_format_type?: string;
  scraped_at: string;
}

export interface IngestSummary {
  inserted: number;
  updated: number;
  unchanged: number;
}

/** A new Post that arrived without a confident format, surfaced for review. */
export interface ReviewPost {
  linkedin_post_id: string;
  snippet: string;
  format?: string;
}

export type IngestResult =
  | { status: "error"; errors: Record<string, string[]> }
  | { status: "review"; posts: ReviewPost[] }
  | {
      status: "ok";
      summary: IngestSummary;
      /** Non-blocking notice, e.g. scraped authors that won't match the client. */
      warning?: string;
    };

// ── Resources ────────────────────────────────────────────────────────────────
// A team reference link (title + URL). Immutable: view + add only. The comp's
// per-row "type" badge is intentionally omitted — SRS OI-05 locked the model
// without a type field.

export interface Resource {
  id: string;
  title: string;
  url: string;
  /** ISO 8601 date string. */
  createdAt: string;
}

// ── Uploads ──────────────────────────────────────────────────────────────────
// An immutable per-ingest audit row (app-owned public.uploads). Read-only.

export interface Upload {
  id: string;
  clientId: string;
  sourceType: SourceType;
  rowsInserted: number;
  rowsUpdated: number;
  rowsUnchanged: number;
  followerCount: number | null;
  /** ISO 8601 date string. */
  createdAt: string;
}

// ── Report Links ─────────────────────────────────────────────────────────────
// A capability record letting ONE Client view their own live report through a
// tokenized public URL (`/r/<token>`) gated by an out-of-band Access Code. The
// viewer is NOT an ArcBase user (narrows ADR 0007): no account, no role tier —
// just a holder of a URL + code. App-owned (public.report_links); every mutation
// and the public verify go through SECURITY DEFINER functions (no service-role
// key, no direct anon read).
//
// ⚠️ THE ACCESS CODE IS NEVER STORED, ONLY ITS BCRYPT HASH — and the raw code is
// returned exactly ONCE, at issue/rotate. `ReportLinkStatus` (the staff read)
// therefore has NO code field: it CANNOT be re-displayed, by construction.

/**
 * The staff-facing state of a Client's Report Link — metadata only.
 *
 * ⚠️ CARRIES NO ACCESS CODE AND NO HASH. `getReportLink` selects these columns
 * and never `access_code_hash`; the raw code is shown once at issue/rotate and is
 * unrecoverable thereafter. A status object that could surface the code would
 * defeat the whole out-of-band model.
 */
export interface ReportLinkStatus {
  clientId: string;
  /** The full `/r/<token>` URL — the token is re-copyable (only the code is secret). */
  url: string;
  /** ISO 8601 — when the active link was issued. */
  createdAt: string;
  /** ISO 8601 of the last successful gate pass, or `null` if never accessed. */
  lastAccessedAt: string | null;
  /** `revoked_at is null` — an active link exists for this Client. */
  active: boolean;
}

/**
 * The result of issuing or rotating a link: the URL plus the raw Access Code,
 * surfaced ONCE. Staff must copy the code now — it is never shown again.
 */
export interface IssuedReportLink {
  url: string;
  accessCode: string;
}

/**
 * The outcome of the public gate's verify. Three states, kept apart so the gate
 * can fail closed with no oracle:
 *   • ok      — token + code matched; `clientId` is the single Client to render,
 *               and `readGrant` is the short-lived bearer secret (minted ONLY here,
 *               on success) that carries the Access Code factor to the data read.
 *               It is sealed into the signed gate cookie, never exposed to the URL.
 *   • invalid — unknown/revoked token OR wrong code. THE SAME REASON for both, on
 *               purpose: a wrong URL and a wrong code must be indistinguishable.
 *   • locked  — too many failed attempts; a rate-limit state, "try again later".
 */
export type ResolveReportLink =
  { ok: true; clientId: string; readGrant: string } | { ok: false; reason: "invalid" | "locked" };

// ── Post attributes ──────────────────────────────────────────────────────────
// App-owned per-post facts that the externally-owned `bi.linkedin_post_latest`
// does not expose. Today that is just the Format Type (Asset Type): ArcBase
// already resolves it during upload review, so it records it here and joins it
// to the BI rows at read time. Column names are the raw table columns.

export interface PostAttributes {
  linkedin_post_id: string;
  /** The format EXACTLY as the Scrape sent it — any casing, never rewritten. */
  post_format_type: string | null;
  /** ISO 8601 date string. */
  recorded_at: string;
}

// ── Client LinkedIn Report ───────────────────────────────────────────────────
// Read-model for `/clients/[id]/report`. ALL THREE sections are scoped by the
// selected ReportPeriod.
//
// Trends and Content Mix were pinned to all-time for a while, to mirror the
// source Power BI report where the KPI pages are month-scoped and the charts sit
// at full range. That is no longer the product decision — the picker governs the
// whole page. What remains all-time BY DESIGN, and must not be rescoped, is:
// `totalPostsAllTime`, both rows of `keyPerformance.matrix`,
// `perThousandFollowers`, and the `allTime` row of `interactionsComparison`.

/**
 * One selectable reporting window. `key` is the URL value and the React key;
 * `label` is the only string ever shown to staff.
 */
export type ReportPeriod =
  | { kind: "all"; key: "all"; label: string }
  | { kind: "year"; key: string; label: string; year: number }
  | { kind: "quarter"; key: string; label: string; year: number; quarter: number }
  | { kind: "month"; key: string; label: string; year: number; month: number };

/** A single figure in the Key Performance grid. `null` renders as an em dash. */
export interface ReportFigure {
  label: string;
  value: number | null;
  /** Appended to the value (e.g. "%"); most figures have none. */
  unit?: string;
  /** Marks a figure that is an approximation, so the UI can say so. */
  approximate?: boolean;
}

/** One row of the Interactions Comparison table. */
export interface InteractionsRow {
  scope: "selected" | "prior3" | "allTime";
  label: string;
  likes: number;
  comments: number;
  /** `reposts` in the BI view — always labelled "Shares" in the UI. */
  shares: number;
  /**
   * ⚠️ THREE STATES, AND THEY MUST NOT COLLAPSE. `saves` is genuinely nullable —
   * the scrape may omit it — so summing nulls as zero would report an absent
   * measurement as a measured zero.
   *
   * `null` when NO post in this scope carried a saves value at all.
   */
  saves: number | null;
  /**
   * Some posts in this scope carried saves and some did not, so the sum is a
   * LOWER BOUND and the UI must say so. A partial sum presented as a total is
   * the same lie as a null presented as a zero, just harder to spot.
   */
  savesPartial: boolean;
}

/**
 * One row of the all-time matrix on the Key Performance panel. The three cells
 * ARE the matrix's three columns — post counts, per-post rates, interaction
 * totals — so a row cannot be built with the wrong number of cells or with its
 * columns transposed.
 */
export interface MatrixRow {
  /** The row header, e.g. "Monthly avg". */
  label: string;
  posts: ReportFigure;
  /**
   * `null` where the measure does not exist for this row: a MAXIMUM has no
   * per-post rate. Renders as an em dash — never as 0, which would be a claim.
   */
  perPost: ReportFigure | null;
  interactions: ReportFigure;
}

/**
 * The bucket granularity of the impressions series. A month period buckets by
 * WEEK — bucketed by month it would be a single bar, which is not a chart.
 */
export type ImpressionsBucket = "month" | "week";

/** A monthly point. `value` is null for a month with no posts → a chart gap. */
export interface MonthPoint {
  label: string;
  value: number | null;
}

/** One asset-type (Format Type) bucket. `format` is canonical, `label` human. */
export interface AssetBucket {
  format: PostFormat;
  label: string;
  value: number;
  count: number;
}

/**
 * How regularly a Client posts, over their ALL-TIME history. Plain descriptive
 * figures and a timeline — it reports rhythm and never SCORES it.
 *
 * ⚠️ DATED BY THE PUBLISH DATE ALONE, AND FOUR-STATE THROUGHOUT. Cadence places a
 * post by `estimated_post_date`; a post scraped at hour-granularity has none, so
 * it is COUNTED in `totalPosts` but OMITTED from every gap and from `timeline` —
 * never dropped onto its scrape instant. The four honest states are kept apart:
 *   • could not be read — cadence rides the report's read; a failed read shows the
 *     report's own unavailable banner, so there is no cadence-specific flag here.
 *   • not applicable    — a figure that cannot exist yet (a gap with <2 dated
 *     posts, a weekly rate over a zero-length span): `null`, an em dash on screen.
 *   • genuinely zero    — a MEASURED zero (two posts on the same day are 0 days
 *     apart): a real number, never conflated with `null`.
 *   • truncated         — under a capped read every figure is a lower bound; the
 *     report's existing truncation banner already says so (no second banner).
 */
export interface PostingCadence {
  /** Every post in the history — the visible N against which every figure reads. */
  totalPosts: number;
  /** Posts carrying a resolved publish date: the ones placed on the timeline. */
  datedPosts: number;
  /**
   * Posts with no resolved publish date. Counted in `totalPosts`, absent from
   * `timeline` and every gap — surfaced so the two can be reconciled and disclosed.
   */
  undatedPosts: number;
  /**
   * Posts per week across the ACTIVE SPAN (first dated post → last dated post),
   * NOT up to today — a client who paused reads as their rhythm while active.
   *
   * `null` (not applicable) with fewer than two dated posts, or when every dated
   * post shares one day: a rate over a zero-length span is undefined, not zero.
   */
  postsPerWeek: number | null;
  /** MEDIAN days between consecutive dated posts — a hiatus must not inflate it.
   *  `null` with fewer than two dated posts; a genuine `0` when posts share a day. */
  medianGapDays: number | null;
  /** Longest gap in days between consecutive dated posts — the "went quiet" signal.
   *  `null` with fewer than two dated posts. */
  longestGapDays: number | null;
  /** Whole days since the most recent dated post. `null` when no post is dated. */
  daysSinceLastPost: number | null;
  /**
   * One resolved-publish-date timestamp (ms) per DATED post, ASCENDING — the marks
   * on the timeline. Empty when nothing is dated. An undated post is never here.
   */
  timeline: number[];
  /**
   * Dated posts counted per calendar WEEK (Monday start), first→last dated post,
   * with empty weeks kept as a genuine `0` (a week with no posts really had none —
   * not missing data). The "Week" view of the switchable chart. Empty when nothing
   * is dated. `Σ count === datedPosts`.
   */
  weekly: CadenceBucket[];
  /** As `weekly`, but per calendar MONTH — the "Month" view. `Σ count === datedPosts`. */
  monthly: CadenceBucket[];
}

/**
 * One bar of the week/month cadence chart: a time bucket and how many posts fell
 * in it. `count` is a real measured value — `0` means "no posts that week", which
 * is a finding, not an absence of data.
 */
export interface CadenceBucket {
  /** Human axis label, e.g. "5 Jan" (week) or "Jul 26" (month). */
  label: string;
  count: number;
}

/** One hashtag and how many posts used it. `tag` is CASE-FOLDED and carries no `#`. */
export interface HashtagCount {
  /** Lower-cased, without the leading `#` (e.g. "saas"). The UI prepends the `#`. */
  tag: string;
  /** How many times it was used across the analysed posts (every use counted). */
  count: number;
}

/**
 * What a Client's content is MADE OF, derived from each post's text — hashtags,
 * length, and how often a post asks a question / links / mentions / uses emoji.
 *
 * ⚠️ COMPOSITIONAL ONLY. This reports what the content IS, never what it EARNED.
 * There is no engagement figure, no ranking, no "top-performing" here by design:
 * on a handful of posts, "posts with a question earned more" is a coincidence
 * dressed as advice, and this document is client-facing.
 *
 * ⚠️ FOUR STATES, KEPT APART. `analysedPosts` is the base every feature is "of":
 *   • could not be analysed — a post with NULL/empty text; counted in `totalPosts`,
 *     omitted from every feature, disclosed. With zero analysable posts every
 *     feature is unknown, which the component renders as an em dash.
 *   • genuinely none/zero   — analysed posts that used no hashtags → `hashtags: []`,
 *     rendered "No hashtags used"; a real `0 of M` for an element. NEVER an em dash.
 *   • truncated             — under a capped read these are lower bounds; the
 *     report's existing banner already says so (no second banner here).
 */
export interface ContentComposition {
  /** Every post — the visible N against which the analysed base reads. */
  totalPosts: number;
  /** Posts with analysable text — the denominator `M` in every "N of M" below. */
  analysedPosts: number;
  /**
   * Posts with NULL or empty `post_content`. Counted in `totalPosts`, omitted from
   * every feature, surfaced so the omission can be reconciled and disclosed.
   */
  unanalysablePosts: number;
  /**
   * Every distinct hashtag used, case-folded, DESCENDING by count then tag. `[]`
   * is a genuine zero when `analysedPosts > 0` ("No hashtags used"); when
   * `analysedPosts === 0` it means "could not be analysed". The UI caps the list
   * for display and shows "+ N more" — the cap is presentation, not here.
   */
  hashtags: HashtagCount[];
  /**
   * MEDIAN character count over the analysed posts. `null` when NONE could be
   * analysed — the em-dash "could not be analysed" state, never a `0`.
   */
  medianLength: number | null;
  /** Analysed posts running PAST the 1,300-char "see more" fold (a real count). */
  pastFold: number;
  /** Analysed posts whose text asks a question. */
  withQuestion: number;
  /** Analysed posts with a URL IN THE TEXT — never `post_url`, which every post has. */
  withLink: number;
  /** Analysed posts that mention an `@handle` in the text. */
  withMention: number;
  /** Analysed posts that use a Unicode emoji. */
  withEmoji: number;
}

export interface ClientReport {
  period: ReportPeriod;
  availablePeriods: ReportPeriod[];
  /** Posts across the whole history, regardless of the selected period. */
  totalPostsAllTime: number;
  keyPerformance: {
    /**
     * The hero: three figures scoped to the selected period. Also the print
     * cover's three headline figures, so this array's shape and labels are
     * read in two places.
     */
    selected: ReportFigure[];
    /** All-time context, read against the matrix's column headers. */
    matrix: MatrixRow[];
    /**
     * Interactions per 1,000 followers, all time. Its OWN field rather than a
     * member of the maxima row, because it is an average — sitting it among
     * maxima was invisible as nine loose cards and wrong in a labelled matrix.
     */
    perThousandFollowers: ReportFigure;
  };
  interactionsComparison: InteractionsRow[];
  /**
   * The impressions series for the selected period. NOT always months — a month
   * period buckets by week (see `impressionsBucket`), which is why this is not
   * called `impressionsByMonth` any more.
   */
  impressionsSeries: MonthPoint[];
  /** Which granularity `impressionsSeries` actually used, so the card can say so. */
  impressionsBucket: ImpressionsBucket;
  /** The reference line on that chart: mean impressions per post, same scope. */
  impressionsAverage: number;
  /**
   * Average impressions by the weekday a post was PUBLISHED on — seven entries,
   * Sunday → Saturday.
   *
   * ⚠️ DATED BY `estimated_post_date` ALONE, undated posts EXCLUDED. The rest of
   * the report windows on `effectiveMs`, which stands `scraped_at` in for an
   * hour-age post's missing publish date; a weekday may not be asserted that way —
   * bucketing a whole weekly scrape onto its scrape day fabricates a rhythm in a
   * client-facing chart. Those posts are counted in `weekdayUndatedPosts` instead.
   * An empty weekday is a genuine 0.
   */
  impressionsByWeekday: { label: string; value: number }[];
  /**
   * Posts in the selected period with NO resolved publish date, excluded from
   * `impressionsByWeekday`. Surfaced (not hidden) so the chart can disclose the
   * exclusion; the datable count it averaged is `impressionsPostCount −
   * weekdayUndatedPosts`.
   */
  weekdayUndatedPosts: number;
  interactionsByAsset: AssetBucket[];
  /** Share of the period's posts by asset type, as a percentage to one decimal. */
  postTypeDistribution: AssetBucket[];
  /**
   * Posting cadence over the ALL-TIME history — DELIBERATELY not period-scoped.
   * Like `totalPostsAllTime` and the Key Performance matrix, it answers a
   * whole-history question ("how regularly does this Client post?") and must not
   * move with the period picker.
   */
  cadence: PostingCadence;
  /**
   * What the content is MADE OF for the SELECTED period — hashtags, length, and
   * element frequencies. FOLLOWS the period picker, like the temporal sections, so
   * it describes the content actually posted in the window on screen. Compositional
   * only — no engagement, no ranking (see `ContentComposition`).
   */
  composition: ContentComposition;
  /**
   * Posts behind the two IMPRESSIONS charts — the period's rows that could be
   * dated. Surfaced so a distribution over 5 posts reads differently from one
   * over 500.
   */
  impressionsPostCount: number;
  /** Posts behind the two ASSET charts — every row in the period. */
  assetPostCount: number;
  /** True when the report source couldn't be read (distinct from "no data"). */
  unavailable?: boolean;
  /**
   * Set when the post history came back SHORT of the pager's cap.
   *
   * ⚠️ THIS ONE REACHES PAPER. The printed report is the artefact that leaves the
   * building, so a partial history must be stated ON THE PAGE — every other
   * surface has a reader who can be told later; a PDF does not.
   */
  truncation?: ReadTruncation | null;
}

// ── Client posts (the per-post drill-down) ───────────────────────────────────
// Read-model for `/clients/[id]/posts`: the individual posts behind the report's
// figures, for the same selected ReportPeriod. No new data source — every field
// comes from `bi.linkedin_post_latest`, plus the app-owned asset type.
//
// ⚠️ `ClientPosts.totalInPeriod` and `ClientReport.assetPostCount` are THE SAME
// NUMBER, and both are computed by `selectPeriodRows` in `@/services/bi-posts`.
// A table that contradicts the count printed above it discredits both screens,
// so neither may grow its own period predicate.

/** One post, as the drill-down table shows it. */
export interface ClientPostRow {
  /** `linkedin_post_id` — the post's identity and the React key. */
  id: string;
  /** Renders as a link when present; as plain text when null. Never a dead link. */
  url: string | null;
  /** Whitespace-collapsed, truncated `post_content`; empty string when absent. */
  snippet: string;
  /** RESOLVED publish date (ISO), or null for hour-age posts. Display only. */
  date: string | null;
  /** Raw relative age as scraped, e.g. "23h" — shown when `date` is null. */
  age: string | null;
  /** Ordering key for the date column: the same value the report windows on. */
  sortMs: number | null;
  format: PostFormat;
  /** `FORMAT_LABELS[format]` — the only format string ever shown to staff. */
  formatLabel: string;
  impressions: number;
  likes: number;
  comments: number;
  /** `reposts` in the view — always labelled "Shares" in the UI. */
  shares: number;
  /**
   * Nullable BY DESIGN: the scrape may omit saves. `null` renders as an em
   * dash, NOT as 0 — an omitted metric is not a measured zero.
   */
  saves: number | null;
  interactions: number;
  /**
   * The VIEW's `calculated_engagement_rate`, as a percentage.
   *
   * ⚠️ READ, NEVER DERIVED. Per ADR 0009 the BI views own the analytics
   * contract, so this is their per-post figure — ArcBase does not compute a
   * rival one and does not back-fill this from `interactions / impressions`
   * when the view carries nothing. `null` means the view had no value; it
   * renders as an em dash, never as 0.
   *
   * Its AGGREGATE counterpart is `weightedRate` in `@/services/analytics` —
   * a ratio of totals, not the mean of this column. Never average these.
   */
  engagementRate: number | null;
}

// ── Data Quality ─────────────────────────────────────────────────────────────
// Read-model for `/data-quality`: across the whole client book, is the pipeline
// actually delivering?
//
// ⚠️ THE FRAME THIS SCREEN REPORTS IN. Attribution happens DOWNSTREAM of ArcBase,
// as a name match (ADR 0009). ArcBase submits Posts to staging and can only
// observe, afterwards, whether they came back attributed in `bi.*`. So this
// model states TWO NUMBERS — submitted and attributed — and never a verdict. A
// name mismatch, a client who genuinely stopped posting, and a downstream outage
// are indistinguishable from here, and the read-model must not pretend otherwise.

/** One registered Client's delivery picture. */
export interface DataQualityRow {
  clientId: string;
  clientName: string;
  /**
   * Σ `rowsInserted` across this Client's uploads — the DISTINCT Posts ArcBase
   * ever wrote to staging. Updates and unchanged rows are re-ingests of Posts
   * already counted, so they are deliberately excluded.
   *
   * `null` when the uploads read could not be trusted — never a 0, which would
   * assert that nothing was ever submitted.
   */
  submitted: number | null;
  /** BI rows carrying this `client_id` — what actually came back. */
  attributed: number;
  /**
   * Of `attributed`, rows with no resolved publish date (hour-age posts). Worth
   * counting because they are invisible to every BOUNDED reporting period.
   */
  undated: number;
  /**
   * Of `attributed`, rows whose canonical asset type is `UNKNOWN` — no
   * `post_attributes` record, or a value the vocabulary does not recognise.
   * `UNKNOWN` is a real member of that vocabulary, not an error.
   */
  unknownFormat: number;
  /** Uploads recorded for this Client; `null` when the uploads read failed. */
  uploadCount: number | null;
  lastIngest: LastUpload;
}

/** Which sources answered, and how completely. All three states are distinct. */
export interface DataQualitySources {
  /** The Client roster could not be read — there is nothing to list. */
  clientsUnavailable: boolean;
  /** The BI read failed — every post-derived figure is meaningless. */
  postsUnavailable: boolean;
  /**
   * The BI read SUCCEEDED but hit the page cap, so every post figure is a LOWER
   * BOUND. Distinct from `postsUnavailable`: the rows are real, just incomplete.
   */
  postsTruncated: boolean;
  /**
   * The uploads read failed OR was truncated. Collapsed on purpose — a truncated
   * audit trail understates what was submitted, which is not a smaller answer
   * but no answer, and both render as "could not be read".
   */
  uploadsUnavailable: boolean;
}

/**
 * The engagement-rate reconciliation.
 *
 * ⚠️ THIS REPORTS A DISAGREEMENT; IT DOES NOT RESOLVE ONE. ArcBase holds three
 * rate definitions — the scraper's `provided_engagement_rate`, the view's
 * `calculated_engagement_rate` (the one it ships), and its own aggregate
 * `weightedRate`. Nothing here averages them or picks a winner; it states where
 * they differ so a human can ask the BI owner why.
 */
export interface RateReconciliation {
  /** Posts the view carries no rate for. Distinct from a rate of 0. */
  postsMissingRate: number;
  /**
   * Total posts the reconciliation examined — the denominator for
   * `postsMissingRate`, so a reader can tell "1 missing of 3" from "1 of 30,000".
   * `0` when no posts were considered at all, which the panel renders as the
   * not-applicable em dash rather than "0 of 0".
   */
  postsConsidered: number;
  /**
   * Posts where the scraper's and the view's rates differ by more than the
   * tolerance. Counts only posts carrying BOTH — a missing value is not a
   * disagreement.
   */
  rateDisagreements: number;
  /** Posts where both rates are present, i.e. the population above was drawn from. */
  rateComparablePosts: number;
  /**
   * MEDIAN of `provided / calculated`, across posts where both are present and
   * calculated is non-zero. `null` when there are none.
   *
   * ⚠️ THIS EXISTS TO MAKE A SCALE MISMATCH OBVIOUS. If one column is a
   * percentage (6.23) and the other a fraction (0.0623), EVERY row "disagrees"
   * and a bare disagreement count reads as a catastrophe rather than as a unit
   * difference. Near 1 → genuine disagreement. Near 100 or 0.01 → the two
   * columns are simply on different scales. The UI must let a reader tell those
   * apart without doing arithmetic.
   */
  rateMedianRatio: number | null;
  /**
   * What that ratio MEANS, decided once here so no reader — and no component —
   * has to do the arithmetic:
   *   • "aligned"  — same scale; any disagreements are genuine and worth asking about
   *   • "rescaled" — the columns are in different units (e.g. 6.23 vs 0.0623),
   *                  which alone explains every "disagreement"
   *   • null       — nothing comparable to judge
   */
  rateScale: "aligned" | "rescaled" | null;
  /**
   * Does the view's per-post rate agree with `interactions / impressions × 100`,
   * within tolerance, across the posts where it can be checked?
   *
   * The single most important output here: the dashboard's aggregate engagement
   * figure is `Σinteractions / Σimpressions`, so if this is false the aggregate
   * and the per-post column are measuring different things under one word.
   * `null` when no post could be checked (none with impressions AND a rate).
   */
  aggregateFormulaMatches: boolean | null;
  /**
   * Posts the formula check could actually be run against — those carrying a
   * rate, a numerator, AND positive impressions. The denominator for
   * `formulaMismatches`.
   */
  formulaCheckedPosts: number;
  /**
   * How many of `formulaCheckedPosts` disagreed.
   *
   * ⚠️ A VERDICT MUST CARRY ITS OWN DENOMINATOR. `aggregateFormulaMatches` is
   * strict, so one outlier out of 5,000 and 5,000 out of 5,000 are both `false`
   * — and a bare "No" presents them identically. This count is what lets a
   * reader size the finding for themselves. It exists to inform the flag's
   * reader, NOT to soften the flag: there is deliberately no threshold above
   * which a mismatch stops counting.
   */
  formulaMismatches: number;
}

export interface DataQuality {
  /** Worst first — see the severity ranking in the service. */
  rows: DataQualityRow[];
  /** Where the three engagement-rate definitions agree, and where they do not. */
  rates: RateReconciliation;
  /**
   * BI rows attributed to NO registered Client — a null `client_id`, or one
   * matching nobody in the roster. The direct counterpart to "submitted but
   * never came back". `null` when either source could not be read.
   */
  unattributedPosts: number | null;
  sources: DataQualitySources;
}

export interface ClientPosts {
  period: ReportPeriod;
  availablePeriods: ReportPeriod[];
  rows: ClientPostRow[];
  /** Rows in the period BEFORE the display cap. Equals `rows.length` when uncapped. */
  totalInPeriod: number;
  /** The cap actually applied, or null when every row is shown. */
  cappedTo: number | null;
  /** True when the source couldn't be read — distinct from "no posts". */
  unavailable?: boolean;
  /**
   * Set when the post history came back SHORT of the pager's cap.
   *
   * ⚠️ DISTINCT FROM `cappedTo`. That is a DISPLAY cap ArcBase chose — every row
   * was read and the table is showing the top slice. This is a READ cap: rows
   * that exist were never fetched, so `totalInPeriod` itself is a lower bound.
   */
  truncation?: ReadTruncation | null;
}
