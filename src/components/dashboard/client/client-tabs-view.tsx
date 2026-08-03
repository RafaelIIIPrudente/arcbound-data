"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export interface TabSpec {
  href: string;
  label: string;
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
 * `isActive` below is an EXACT pathname match, so every href handed in must be a
 * distinct path — never a prefix of another, or two tabs would light up.
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
        const isActive = pathname === tab.href;
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
