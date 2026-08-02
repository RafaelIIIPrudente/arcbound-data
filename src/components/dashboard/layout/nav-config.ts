import { paths } from "@/paths";

// The ArcBase sidebar navigation. Single-tenant, so no per-role visibility — the
// five items are the whole product surface. Design: Geist-Mono labels with a
// left accent bar for the active item (docs/arcbase-dashboard-design-brief).
//
// ⚠️ SRS §5 STILL DESCRIBES FOUR. Data Quality was added after it was written and
// the SRS has not caught up — the delta is deliberate and flagged, not an
// oversight. Reconcile the SRS separately; do not quietly drop the item to make
// this comment true again.

export interface NavItem {
  title: string;
  href: string;
}

export const navItems: NavItem[] = [
  { title: "Dashboard", href: paths.home },
  { title: "Client List", href: paths.clients.list },
  // ⚠️ SERVICE-AGNOSTIC, AND THAT IS THE POINT (ADR 0012). This screen hosts two
  // upload shapes now — LinkedIn post metrics and Outreach snapshots — so naming
  // either one in the sidebar would misdescribe half of what is behind it. The
  // route stays `/upload`; only the label changed.
  { title: "Add Data", href: paths.upload },
  { title: "Resources", href: paths.resources },
  { title: "Data Quality", href: paths.dataQuality },
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
  // ⚠️ ALSO BEFORE THE GENERIC RULE BELOW, FOR THE SAME REASON AS /report. The
  // `startsWith(clients/)` case returns "Client detail" and swallows every
  // nested client route, so a branch placed after it never runs — dead code that
  // looks alive and fails silently rather than loudly.
  if (pathname.startsWith(`${paths.clients.list}/`) && pathname.endsWith("/outreach")) {
    return { lead: "Outreach", accent: "system" };
  }
  if (pathname.startsWith(`${paths.clients.list}/`)) return { lead: "Client", accent: "detail" };
  if (pathname === paths.upload) return { lead: "Add", accent: "data" };
  if (pathname === paths.resources) return { lead: "", accent: "Resources" };
  if (pathname === paths.dataQuality) return { lead: "Data", accent: "quality" };
  if (pathname.startsWith(paths.customers.list)) return { lead: "", accent: "Customers" };
  // ⚠️ BEFORE THE GENERIC SETTINGS RULE, FOR THE THIRD TIME IN THIS FILE.
  // `paths.settings.roles` ("/settings/roles") starts with `paths.settings.profile`
  // ("/settings"), so the rule below matches it too and returns "Settings". A
  // branch placed after it never runs — dead code that looks alive.
  if (pathname.startsWith(paths.settings.roles)) return { lead: "Staff", accent: "roles" };
  if (pathname.startsWith(paths.settings.profile)) return { lead: "", accent: "Settings" };
  return { lead: "", accent: "ArcBase" };
}
