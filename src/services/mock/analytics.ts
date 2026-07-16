import type { DashboardRange, RecentPost, SeriesPoint } from "@/services/types";

// Obviously-placeholder analytics data matching the design comp
// (docs/arcbase-dashboard-design-brief). Replace when the seam is wired to a
// real backend. All values are for the DEFAULT view (all clients, 30-day range);
// the service scales them deterministically by range and client.

export const LAST_SYNC = "2026-07-14 09:12";

/** Total posts in the default (30-day, all-clients) window. */
export const BASE_TOTAL_POSTS = 267;

/**
 * Base KPI metrics (all clients, 30 days). `delta` is SIGNED percent — its sign
 * drives the ▲/▼ direction; the service surfaces the magnitude + direction.
 */
export const BASE_METRICS = {
  impressions: { label: "Impressions", value: 248930, delta: 15 },
  likes: { label: "Likes", value: 12480, delta: 8 },
  comments: { label: "Comments", value: 1204, delta: 22 },
  reposts: { label: "Reposts", value: 486, delta: -4 },
  saves: { label: "Saves", value: 892, delta: 11 },
} as const;

/** Engagement rate is a rate, not a count — it does not scale by client share. */
export const BASE_ENGAGEMENT = { value: 5.7, delta: 0.6 } as const;

// Series per range — different shapes so switching the range visibly re-draws.
export const IMPRESSIONS_SERIES: Record<DashboardRange, SeriesPoint[]> = {
  "7d": [
    { label: "Mon", value: 6200 },
    { label: "Tue", value: 7100 },
    { label: "Wed", value: 6800 },
    { label: "Thu", value: 8300 },
    { label: "Fri", value: 9100 },
    { label: "Sat", value: 5400 },
    { label: "Sun", value: 6900 },
  ],
  "30d": [
    { label: "Wk 1", value: 41200 },
    { label: "Wk 2", value: 52800 },
    { label: "Wk 3", value: 48600 },
    { label: "Wk 4", value: 61400 },
    { label: "Wk 5", value: 58200 },
    { label: "Wk 6", value: 66500 },
  ],
  "90d": [
    { label: "Apr", value: 118400 },
    { label: "May", value: 142600 },
    { label: "Jun", value: 168900 },
    { label: "Jul", value: 187300 },
    { label: "Aug", value: 201700 },
    { label: "Sep", value: 224500 },
  ],
};

export const ENGAGEMENT_SERIES: Record<DashboardRange, SeriesPoint[]> = {
  "7d": [
    { label: "Mon", value: 4.9 },
    { label: "Tue", value: 5.2 },
    { label: "Wed", value: 5.0 },
    { label: "Thu", value: 5.6 },
    { label: "Fri", value: 6.1 },
    { label: "Sat", value: 5.3 },
    { label: "Sun", value: 5.7 },
  ],
  "30d": [
    { label: "Wk 1", value: 5.1 },
    { label: "Wk 2", value: 5.4 },
    { label: "Wk 3", value: 5.2 },
    { label: "Wk 4", value: 5.9 },
    { label: "Wk 5", value: 5.6 },
    { label: "Wk 6", value: 5.7 },
  ],
  "90d": [
    { label: "Apr", value: 4.8 },
    { label: "May", value: 5.1 },
    { label: "Jun", value: 5.3 },
    { label: "Jul", value: 5.5 },
    { label: "Aug", value: 5.6 },
    { label: "Sep", value: 5.7 },
  ],
};

// Recent posts — snippets drawn from the sample scrape
// (docs/arcbase-dashboard-design-brief/project/uploads/linkedin_posts_1784129139895.csv).
// Format types are assigned here (the sample scrape omitted them).
export const RECENT_POSTS: RecentPost[] = [
  {
    id: "POST-0001",
    snippet:
      "At the beginning of the year, we ran into a good problem — we were closing more than we could deliver.",
    date: "Jul 13",
    format: "text",
    impressions: 385,
    likes: 11,
    comments: 8,
  },
  {
    id: "POST-0002",
    snippet:
      "A former Apple designer built Ferrari's first electric car. It was flagged, then quietly shelved.",
    date: "Jul 10",
    format: "video",
    impressions: 1959,
    likes: 27,
    comments: 15,
  },
  {
    id: "POST-0003",
    snippet:
      "Grateful to moderate a discussion with John Belizaire, Agnes Budzyn, and the rest of the panel.",
    date: "Jul 9",
    format: "image",
    impressions: 617,
    likes: 27,
    comments: 3,
  },
  {
    id: "POST-0004",
    snippet:
      "For the past few years, I've been going through a pretty major health reset. Here's what changed.",
    date: "Jul 8",
    format: "carousel",
    impressions: 544,
    likes: 11,
    comments: 2,
  },
  {
    id: "POST-0005",
    snippet:
      "A classroom full of kids chanting your name — not in the way you'd want. A lesson in resilience.",
    date: "Jul 7",
    format: "link",
    impressions: 267,
    likes: 5,
    comments: 5,
  },
];
