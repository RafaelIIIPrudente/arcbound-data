import { describe, it, expect } from "vitest";

import { computeAuthDisabled } from "./config";

// The browsable "auth disabled" bypass is a policy: it may apply ONLY when
// Supabase is unconfigured AND we are not in production. Production must fail
// CLOSED even when unconfigured. See docs/adr/0002-supabase-only-auth.md.
describe("computeAuthDisabled", () => {
  it("disables auth when unconfigured in development", () => {
    expect(computeAuthDisabled(false, "development")).toBe(true);
  });

  it("fails closed: never disables auth in production when unconfigured", () => {
    expect(computeAuthDisabled(false, "production")).toBe(false);
  });

  it("never bypasses when Supabase is configured (production)", () => {
    expect(computeAuthDisabled(true, "production")).toBe(false);
  });

  it("never bypasses when Supabase is configured (development)", () => {
    expect(computeAuthDisabled(true, "development")).toBe(false);
  });
});
