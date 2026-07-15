"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { paths } from "@/paths";

const tabs = [
  { label: "Members", href: paths.dashboard.team.members },
  { label: "Permissions", href: paths.dashboard.team.permissions },
];

export function TeamTabs() {
  const pathname = usePathname();

  return (
    <div className="border-b">
      <nav className="flex gap-4">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "border-b-2 px-1 pb-2 text-sm transition-colors",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
