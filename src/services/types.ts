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
  /** Post format type (image / carousel / link / text / video). */
  format: string;
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
}
