import {
  DollarSign,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { OverviewStat } from "@/services/metrics";

const ICONS: Record<string, LucideIcon> = {
  revenue: DollarSign,
  customers: Users,
  sales: ShoppingCart,
};

export function StatCards({ stats }: { stats: OverviewStat[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stats.map((stat) => {
        const Icon = ICONS[stat.key] ?? Users;
        const Trend = stat.trend === "up" ? TrendingUp : TrendingDown;
        return (
          <Card key={stat.key}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <Icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{stat.value}</div>
              <p
                className={cn(
                  "mt-1 flex items-center gap-1 text-xs",
                  stat.trend === "up"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400",
                )}
              >
                <Trend className="size-3" />
                {stat.delta}% vs last month
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
