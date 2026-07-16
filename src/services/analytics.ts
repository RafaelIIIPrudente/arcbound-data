import { listClients } from "@/services/clients";
import type { DashboardAnalytics, DashboardRange, Kpi, SeriesPoint } from "@/services/types";
import {
  BASE_ENGAGEMENT,
  BASE_METRICS,
  BASE_TOTAL_POSTS,
  ENGAGEMENT_SERIES,
  IMPRESSIONS_SERIES,
  LAST_SYNC,
  RECENT_POSTS,
} from "@/services/mock/analytics";

// ─────────────────────────────────────────────────────────────────────────────
// Analytics Service Seam (dashboard read-model). Deterministic mock: the base
// figures (all clients, 30 days) are scaled by a range factor and a per-client
// share so the filters visibly change the data. No Date.now/random. To go live,
// swap the body for Supabase view queries — the signature stays identical.
// See docs/adr/0003-mock-first-service-seam.md.
// ─────────────────────────────────────────────────────────────────────────────

// Multipliers relative to the 30-day baseline (30d → the comp values exactly).
const RANGE_FACTOR: Record<DashboardRange, number> = { "7d": 0.3, "30d": 1, "90d": 2.7 };

/** Human label for the "vs. prior …" copy and the chart caption. */
export const RANGE_LABEL: Record<DashboardRange, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
};

function toKpi(m: { label: string; value: number; delta: number }, scale: number): Kpi {
  return {
    label: m.label,
    value: Math.round(m.value * scale),
    delta: Math.abs(m.delta),
    direction: m.delta >= 0 ? "up" : "down",
  };
}

function scaleSeries(series: SeriesPoint[], scale: number, round: boolean): SeriesPoint[] {
  return series.map((p) => ({
    label: p.label,
    value: round ? Math.round(p.value * scale) : p.value,
  }));
}

export interface DashboardOptions {
  clientId?: string;
  range: DashboardRange;
}

export async function getDashboardAnalytics({
  clientId,
  range,
}: DashboardOptions): Promise<DashboardAnalytics> {
  // A client's share of the analytics = its posts over all clients' posts, so a
  // client with no posts naturally yields an empty dashboard (UC-05).
  const { items: clients } = await listClients({ pageSize: 1000 });
  const totalAcross = clients.reduce((sum, c) => sum + c.postsCount, 0);

  let clientFactor = 1;
  if (clientId) {
    const client = clients.find((c) => c.id === clientId);
    clientFactor = client && totalAcross > 0 ? client.postsCount / totalAcross : 0;
  }

  const scale = RANGE_FACTOR[range] * clientFactor;
  const empty = scale === 0;

  return {
    totalPosts: Math.round(BASE_TOTAL_POSTS * scale),
    lastSync: LAST_SYNC,
    hero: toKpi(BASE_METRICS.impressions, scale),
    kpis: [BASE_METRICS.likes, BASE_METRICS.comments, BASE_METRICS.reposts, BASE_METRICS.saves].map(
      (m) => toKpi(m, scale),
    ),
    // Engagement is a rate, not a count — it doesn't scale by client share; it
    // only zeroes out when there's nothing to report.
    engagement: {
      value: empty ? 0 : BASE_ENGAGEMENT.value,
      delta: BASE_ENGAGEMENT.delta,
    },
    impressionsSeries: scaleSeries(IMPRESSIONS_SERIES[range], scale, true),
    engagementSeries: empty
      ? ENGAGEMENT_SERIES[range].map((p) => ({ label: p.label, value: 0 }))
      : ENGAGEMENT_SERIES[range],
    recentPosts: empty ? [] : RECENT_POSTS,
  };
}
