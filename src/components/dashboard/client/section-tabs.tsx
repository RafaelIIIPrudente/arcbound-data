"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export interface SectionTabSpec {
  href: string;
  label: string;
}

/**
 * A one-level-down sub-nav, for a Client section that has more than one page —
 * today, only LinkedIn: Report ⇄ Posts (D17/D18). Same link-tab look as
 * `ClientTabsView`, and the same reasoning for being real `<Link>`s rather than
 * the shadcn `<Tabs>` primitive: each entry is a separate SERVER route with its
 * own data fetch and its own `?period=`, so a stateful tab would have to hold
 * both pages' data in one client component.
 *
 * Deliberately GENERAL — a plain `{href,label}` list plus the current pathname,
 * with no knowledge of Services, Arcbound, or which section it is nested under.
 * The caller decides what belongs in the list; today only the LinkedIn section
 * renders one, because Outreach has a single page.
 *
 * ⚠️ EXACT PATHNAME MATCH, SAME RULE AS THE PARENT ROW. No href here may be a
 * prefix of another, for the same reason `client-tabs-view.tsx` forbids it — a
 * `startsWith` comparison would let one entry light up for a route that
 * actually belongs to a different one.
 */
export function SectionTabs({ tabs }: { tabs: SectionTabSpec[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Section pages"
      className="flex max-w-full items-center gap-5 overflow-x-auto border-b"
    >
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 pb-2 font-mono text-[11px] tracking-[0.12em] whitespace-nowrap uppercase transition-colors",
              "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
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
  );
}
