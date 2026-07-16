"use client";

import { usePathname } from "next/navigation";

import { ModeToggle } from "@/components/theme/mode-toggle";
import { signOut } from "@/lib/auth/actions";

import { MobileNav } from "./mobile-nav";
import { resolvePageTitle } from "./nav-config";

// The deployment tag shown in the top bar (design comp). Static for now; a later
// slice can drive it from config/env if ArcBase gains multiple environments.
const ENV_TAG = "STAGING";

/**
 * Top bar: the contextual page title (with the design's italic-accent word), the
 * environment tag, the theme toggle, and the signed-in user's avatar + Sign out.
 */
export function TopBar({ email }: { email?: string }) {
  const pathname = usePathname();
  const { lead, accent } = resolvePageTitle(pathname);
  const initials = (email ?? "?").slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background px-4 py-4 md:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <MobileNav />
        <h1 className="truncate font-display text-xl leading-none font-bold tracking-tight md:text-2xl">
          {lead ? `${lead} ` : ""}
          <em className="text-primary italic">{accent}</em>
        </h1>
      </div>

      <div className="flex flex-none items-center gap-2 md:gap-3">
        <span className="hidden rounded border px-2 py-1 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase sm:inline">
          {ENV_TAG}
        </span>
        <ModeToggle />
        <div className="flex items-center gap-2.5 border-l pl-2 md:pl-3">
          <span className="flex size-8 flex-none items-center justify-center rounded-full bg-primary font-display text-xs font-bold text-primary-foreground">
            {initials}
          </span>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-sm font-mono text-[10.5px] tracking-[0.1em] text-muted-foreground uppercase transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
