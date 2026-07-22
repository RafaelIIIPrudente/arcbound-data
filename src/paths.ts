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
  },
  upload: "/upload",
  resources: "/resources",
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
  },
  auth: {
    resetPassword: "/auth/reset-password",
    updatePassword: "/auth/update-password",
    callback: "/auth/callback",
  },
} as const;
