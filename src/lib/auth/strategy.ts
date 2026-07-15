// The template wires a single auth strategy (Supabase). The abstraction is kept
// so a second provider could be added later without rewriting callers.
// See docs/adr/0002-supabase-only-auth.md.
export const AuthStrategy = {
  SUPABASE: "SUPABASE",
} as const;
