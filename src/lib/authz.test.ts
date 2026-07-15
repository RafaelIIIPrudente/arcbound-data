import type { User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { DEFAULT_ROLE, hasRole, roleFromUser } from "./authz";

const admin: Pick<User, "app_metadata"> = { app_metadata: { role: "admin" } };
const bogus: Pick<User, "app_metadata"> = { app_metadata: { role: "wizard" } };

describe("authz", () => {
  it("reads the role from app_metadata", () => {
    expect(roleFromUser(admin)).toBe("admin");
  });

  it("falls back to the default role for null or unknown roles", () => {
    expect(roleFromUser(null)).toBe(DEFAULT_ROLE);
    expect(roleFromUser(bogus)).toBe(DEFAULT_ROLE);
  });

  it("hasRole matches any allowed role", () => {
    expect(hasRole(admin, "admin", "superadmin")).toBe(true);
    expect(hasRole(admin, "member")).toBe(false);
    expect(hasRole(null, "admin")).toBe(false);
  });
});
