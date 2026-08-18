// Route + link registry. Never hard-code paths in components — reference these.
// ArcBase is single-tenant and internal: every route except `/login` (and the
// retained auth callback / password-reset routes) is auth-gated by middleware.
export const paths = {
  home: "/",
  login: "/login",
  clients: {
    list: "/clients",
    details: (id: string) => `/clients/${id}`,
    report: (id: string) => `/clients/${id}/report`,
    /** Per-post drill-down: the individual posts behind the report's figures. */
    posts: (id: string) => `/clients/${id}/posts`,
    // The Outreach System tab: the latest prospect snapshot for this Client.
    //
    // ⚠️ STAFF-ONLY, AND IT MUST STAY THAT WAY. Unlike the LinkedIn report, this
    // route shows THIRD-PARTY PERSONAL DATA — prospect names, LinkedIn URLs,
    // locations, drafted messages, and email addresses inside Notes. ADR 0012
    // draws the line explicitly: a Client may see outreach only as aggregate
    // counts, through the Report Link's SECURITY DEFINER path. Nothing here may
    // be reused by a print view, a public component, or `/r/[token]`.
    outreach: (id: string) => `/clients/${id}/outreach`,
    // The print-optimised export of the report above. `(print)` is a route
    // GROUP, so it never appears in the URL — this path is auth-gated by the
    // same default-deny rule as every other app route (see lib/route-access).
    reportPrint: (id: string) => `/clients/${id}/report/print`,
  },
  upload: "/upload",
  resources: "/resources",
  // Public, tokenized client Report Link — the ONLY unauthenticated app route
  // besides `/login`. Gated by an out-of-band Access Code (see the `/r/[token]`
  // route + lib/report-link-session), NOT by the staff auth session. The base is
  // its own entry so lib/route-access can mark `/r` public without hard-coding it.
  reportLinkBase: "/r",
  reportLink: (token: string) => `/r/${token}`,
  /** Pipeline health across the whole client book: submitted vs. attributed. */
  dataQuality: "/data-quality",
  // Template reference feature — kept building, not linked in the ArcBase nav.
  // A later slice (T3) repurposes it into Clients.
  customers: {
    list: "/customers",
    create: "/customers/create",
    details: (customerId: string) => `/customers/${customerId}`,
  },
  // Kept from the template (not an ArcBase nav item); reachable by URL.
  settings: {
    profile: "/settings",
    security: "/settings/security",
    // Staff Roles admin screen (ADR 0013). ADMIN-ONLY — the page calls
    // `requireAdmin()`, and `/settings` links to it only for an admin.
    //
    // ⚠️ ITS OWN ROUTE, NOT A TAB ON `/settings`. Folding it into the profile
    // page would force `requireAdmin()` onto that page, locking every analyst out
    // of their own profile and password form to hide one panel from them.
    roles: "/settings/roles",
    // Arcbound Services registry (ADR 0015). ADMIN-ONLY, and a sibling of
    // `roles` for the same reason: `/settings` itself must stay reachable by
    // every staff member, so admin-only surfaces get their own routes rather
    // than becoming tabs that would force `requireAdmin()` onto the parent.
    services: "/settings/services",
    // The industries registry that the Client Industry picker draws from.
    // ADMIN-ONLY, and a sibling of `roles` and `services` for the same reason:
    // `/settings` itself must stay reachable by every staff member.
    industries: "/settings/industries",
  },
  auth: {
    resetPassword: "/auth/reset-password",
    updatePassword: "/auth/update-password",
    callback: "/auth/callback",
  },
} as const;
