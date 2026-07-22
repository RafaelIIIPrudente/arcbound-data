"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { paths } from "@/paths";

/**
 * Client sub-navigation: Overview ⇄ LinkedIn Report.
 *
 * Deliberately NOT the shadcn <Tabs> primitive (see settings-tabs.tsx, where it
 * IS correct). Each tab here is a separate SERVER route with its own data fetch
 * and its own search params, so these must be real links — a stateful tab would
 * have to hold both pages' data in one client component and would drop the
 * period from the URL. Styled to match the TabsList/TabsTrigger look.
 */
export function ClientTabs({ clientId }: { clientId: string }) {
  const pathname = usePathname();

  const tabs = [
    { href: paths.clients.details(clientId), label: "Overview" },
    { href: paths.clients.report(clientId), label: "LinkedIn Report" },
  ];

  return (
    <nav
      aria-label="Client sections"
      className="inline-flex h-9 w-fit max-w-full items-center justify-center gap-1 overflow-x-auto rounded-lg bg-muted p-[3px]"
    >
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex h-full items-center justify-center rounded-md border border-transparent px-3 py-1 text-sm font-medium whitespace-nowrap transition-all",
              "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring",
              isActive
                ? "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30"
                : "text-foreground/60 hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
