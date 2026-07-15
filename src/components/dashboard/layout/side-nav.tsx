"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Wordmark } from "@/components/brand/wordmark";
import { cn } from "@/lib/utils";
import { paths } from "@/paths";

import { isNavItemActive, navItems } from "./nav-config";

/**
 * ArcBase sidebar. Fixed 236px frame with the wordmark, the four nav items
 * (Geist-Mono labels with a left accent bar marking the active route), and a
 * footer — per docs/arcbase-dashboard-design-brief. Single-tenant, so there is
 * no organisation navigation (ADR 0007).
 */
export function SideNav() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-svh w-[236px] flex-none flex-col border-r bg-background">
      <div className="border-b px-6 py-5">
        <Link href={paths.home} className="inline-block">
          <Wordmark className="text-xl" />
        </Link>
        <div className="mt-1 font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase">
          by Arcbound
        </div>
      </div>

      <nav className="flex-1 py-4">
        <div className="flex items-center gap-1.5 px-6 pb-2.5 font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase">
          <span className="text-primary">—</span>Menu
        </div>
        <ul>
          {navItems.map((item) => {
            const active = isNavItemActive(item.href, pathname);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="relative flex items-center px-6 py-2.5 transition-colors hover:bg-accent/50"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-1/2 left-0 h-4 w-[3px] -translate-y-1/2 bg-primary transition-opacity",
                      active ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span
                    className={cn(
                      "font-mono text-[11.5px] tracking-[0.06em]",
                      active ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {item.title}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t px-6 py-4 font-mono text-[9px] leading-[1.9] tracking-[0.14em] text-muted-foreground uppercase">
        <div>Arcbase · Arcbound</div>
        <div className="opacity-70">v0.1 · staging</div>
      </div>
    </aside>
  );
}
