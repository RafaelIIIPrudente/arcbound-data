import type { Metadata } from "next";

import { RevenueChart } from "@/components/dashboard/overview/revenue-chart";
import { StatCards } from "@/components/dashboard/overview/stat-cards";
import { getOverviewStats, getRevenueSeries } from "@/services/metrics";

export const metadata: Metadata = { title: "Overview" };

export default async function DashboardPage() {
  const [stats, revenue] = await Promise.all([getOverviewStats(), getRevenueSeries()]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      <StatCards stats={stats} />
      <RevenueChart data={revenue} />
    </div>
  );
}
