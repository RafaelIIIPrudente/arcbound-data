import { describe, expect, it } from "vitest";

import { buildCsp } from "./csp";

const NONCE = "test-nonce-123";

describe("buildCsp", () => {
  it("prod: nonce + strict-dynamic script-src, locked frame/object, no unsafe-eval", () => {
    const csp = buildCsp(NONCE, { isDev: false });
    expect(csp).toContain(`script-src 'self' 'nonce-${NONCE}' 'strict-dynamic'`);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("dev: includes 'unsafe-eval' for HMR", () => {
    const csp = buildCsp(NONCE, { isDev: true });
    expect(csp).toContain("'unsafe-eval'");
  });

  it("derives supabase https + wss origins into connect-src", () => {
    const csp = buildCsp(NONCE, { isDev: false, supabaseUrl: "https://abc.supabase.co" });
    expect(csp).toContain("https://abc.supabase.co");
    expect(csp).toContain("wss://abc.supabase.co");
  });

  it("without supabaseUrl, connect-src is just 'self' in prod", () => {
    const csp = buildCsp(NONCE, { isDev: false });
    expect(csp).toMatch(/connect-src 'self'(;|$)/);
  });
});
