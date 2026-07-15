// Mock dashboard metrics behind the Service Seam. Swap for real queries later.

export interface OverviewStat {
  key: string;
  label: string;
  value: string;
  delta: number;
  trend: "up" | "down";
}

export interface RevenuePoint {
  month: string;
  revenue: number;
}

export async function getOverviewStats(): Promise<OverviewStat[]> {
  return [
    { key: "revenue", label: "Total revenue", value: "$92,175", delta: 16, trend: "up" },
    { key: "customers", label: "Customers", value: "1,204", delta: 24, trend: "up" },
    { key: "sales", label: "Sales", value: "280", delta: 8, trend: "down" },
  ];
}

export async function getRevenueSeries(): Promise<RevenuePoint[]> {
  return [
    { month: "Jan", revenue: 4200 },
    { month: "Feb", revenue: 5100 },
    { month: "Mar", revenue: 4800 },
    { month: "Apr", revenue: 6300 },
    { month: "May", revenue: 7200 },
    { month: "Jun", revenue: 9217 },
  ];
}
