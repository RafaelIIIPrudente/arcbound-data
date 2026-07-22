import { paths } from "@/paths";

// The ArcBase sidebar navigation. Single-tenant, so no per-role visibility — the
// four items are the whole product surface (SRS §5). Design: Geist-Mono labels
// with a left accent bar for the active item (docs/arcbase-dashboard-design-brief).

export interface NavItem {
  title: string;
  href: string;
}

export const navItems: NavItem[] = [
  { title: "Dashboard", href: paths.home },
  { title: "Client List", href: paths.clients.list },
  { title: "Add LI Post Metrics", href: paths.upload },
  { title: "Resources", href: paths.resources },
];

/**
 * Pure active-state rule. The home item (`/`) is active only on an exact match;
 * every other item is active on its own route and any nested route beneath it —
 * so Client List stays active on `/clients/[id]`.
 */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === paths.home) return pathname === paths.home;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface PageTitle {
  /** Leading (non-accent) words; may be empty. */
  lead: string;
  /** Trailing word rendered in italic accent (the design's `<em>` treatment). */
  accent: string;
}

/**
 * The top-bar heading for a route, matching the design comp's italic-accent
 * titles. Kept pure (route → title) so the top-bar can derive it from the
 * current pathname.
 */
export function resolvePageTitle(pathname: string): PageTitle {
  if (pathname === paths.home) return { lead: "Post", accent: "analytics" };
  if (pathname === paths.clients.list) return { lead: "Client", accent: "list" };
  // The report is nested under a client, so it must be matched BEFORE the
  // generic client-detail rule below (which would otherwise swallow it).
  if (pathname.startsWith(`${paths.clients.list}/`) && pathname.endsWith("/report")) {
    return { lead: "LinkedIn", accent: "report" };
  }
  if (pathname.startsWith(`${paths.clients.list}/`)) return { lead: "Client", accent: "detail" };
  if (pathname === paths.upload) return { lead: "Add post", accent: "metrics" };
  if (pathname === paths.resources) return { lead: "", accent: "Resources" };
  if (pathname.startsWith(paths.customers.list)) return { lead: "", accent: "Customers" };
  if (pathname.startsWith(paths.settings.profile)) return { lead: "", accent: "Settings" };
  return { lead: "", accent: "ArcBase" };
}
