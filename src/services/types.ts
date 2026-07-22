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
  /** Count of the Client's Posts. Mock-derived today; real once ingestion lands. */
  postsCount: number;
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

export interface DashboardAnalytics {
  totalPosts: number;
  lastSync: string;
  hero: Kpi;
  kpis: Kpi[];
  engagement: { value: number; delta: number };
  impressionsSeries: SeriesPoint[];
  engagementSeries: SeriesPoint[];
  recentPosts: RecentPost[];
  /** True when the analytics source couldn't be read (distinct from "no data"). */
  unavailable?: boolean;
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
// Read-model for `/clients/[id]/report`. Section 1 is scoped by the selected
// ReportPeriod; sections 2 and 3 are always all-time (and say so in the UI).

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
  impressionsByMonth: MonthPoint[];
  /** The reference line on the by-month chart: mean impressions per post. */
  impressionsAverage: number;
  /** Seven entries, Sunday → Saturday. */
  impressionsByWeekday: { label: string; value: number }[];
  interactionsByAsset: AssetBucket[];
  /** Share of posts by asset type, as a percentage to one decimal place. */
  postTypeDistribution: AssetBucket[];
  /** True when the report source couldn't be read (distinct from "no data"). */
  unavailable?: boolean;
}
