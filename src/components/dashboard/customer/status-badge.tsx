import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CustomerStatus } from "@/services/types";

const STATUS: Record<CustomerStatus, { label: string; className: string }> = {
  active: {
    label: "Active",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  pending: {
    label: "Pending",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  blocked: {
    label: "Blocked",
    className: "bg-red-500/15 text-red-700 dark:text-red-400",
  },
};

export function StatusBadge({ status }: { status: CustomerStatus }) {
  const { label, className } = STATUS[status];
  return (
    <Badge variant="outline" className={cn("border-transparent", className)}>
      {label}
    </Badge>
  );
}
