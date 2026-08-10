"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export interface TabSpec {
  /** Where the tab NAVIGATES to when clicked. */
  href: string;
  label: string;
  /**
   * Every pathname that counts as "on this tab" — checked by an EXACT match,
   * NEVER `startsWith`/a prefix (see the ⚠️ below). Usually just `[href]`, but
   * the LinkedIn tab's set also holds the Posts sub-route (D17/D18): Posts is a
   * sub-nav item inside the LinkedIn section now, and its PARENT tab must stay
   * current while a visitor is on it.
   */
  activePaths: string[];
}

/**
 * The pathname-driven rendering of the Client sub-navigation. Takes an
 * ALREADY-DECIDED tab list and knows nothing about Services or Arcbound —
 * whether that list came from a real Client's assignments or a test fixture
 * makes no difference to this component.
 *
 * ⚠️ SEPARATE FILE FROM `client-tabs.tsx`, AND THAT IS NOT OPTIONAL. `usePathname`
 * requires `"use client"`, but the piece that decides WHICH tabs to offer
 * (`ClientTabs`) must be `async` to read `getClientServices` — and Next.js does
 * not support async Client Components. The `"use client"` directive is
 * FILE-scoped, so the two pieces cannot share a module; this file is the client
 * half, `client-tabs.tsx` is the server half that renders it.
 *
 * Deliberately NOT the shadcn <Tabs> primitive (see settings-tabs.tsx, where it
 * IS correct). Each tab here is a separate SERVER route with its own data fetch
 * and its own search params, so these must be real links — a stateful tab would
 * have to hold both pages' data in one client component and would drop the
 * period from the URL. Styled to match the TabsList/TabsTrigger look.
 *
 * ⚠️ `isActive` BELOW CHECKS EXACT MEMBERSHIP IN EACH TAB'S OWN `activePaths`
 * SET — NEVER `startsWith`/A PREFIX ON `href`. `/clients/<id>` (Overview's href)
 * prefixes every other Client route, so a prefix comparison would light
 * Overview on all of them at once. The unit is a SET, not a single href,
 * because one tab (LinkedIn) now legitimately owns two routes (D18) — but two
 * different tabs' sets must never overlap, or two tabs would light up on the
 * same route; `client-tabs.test.tsx` asserts the COUNT of current tabs, not
 * just which one, specifically to catch that.
 */
export function ClientTabsView({ tabs }: { tabs: TabSpec[] }) {
  const pathname = usePathname();

  return (
    // A ruled row with an accent marker on the active tab, not a grey pill.
    // The pill was stock shadcn and the one element on the page speaking a
    // different language than every mono-uppercase eyebrow around it.
    <nav
      aria-label="Client sections"
      className="flex max-w-full items-center gap-7 overflow-x-auto border-b"
    >
      {tabs.map((tab) => {
        const isActive = tab.activePaths.includes(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 pb-2.5 font-mono text-[11px] tracking-[0.12em] whitespace-nowrap uppercase transition-colors",
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
