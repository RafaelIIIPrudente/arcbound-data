import { describe, it, expect } from "vitest";

import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("accepts an empty env (all optional; NODE_ENV defaults to development)", () => {
    const env = parseEnv({});
    expect(env.NODE_ENV).toBe("development");
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBeUndefined();
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBeUndefined();
  });

  it("parses provided Supabase values", () => {
    const env = parseEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "k",
    });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://x.supabase.co");
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe("k");
  });

  it("throws on an invalid Supabase URL", () => {
    expect(() => parseEnv({ NEXT_PUBLIC_SUPABASE_URL: "not-a-url" })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
  });

  it("throws on an invalid log level", () => {
    expect(() => parseEnv({ NEXT_PUBLIC_LOG_LEVEL: "LOUD" })).toThrow(/NEXT_PUBLIC_LOG_LEVEL/);
  });

  it("treats a set-but-empty optional var as unset (URL)", () => {
    const env = parseEnv({ NEXT_PUBLIC_SUPABASE_URL: "" });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBeUndefined();
  });

  it("still throws on a non-empty invalid URL", () => {
    expect(() => parseEnv({ NEXT_PUBLIC_SUPABASE_URL: "notaurl" })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
  });

  it("treats a set-but-empty optional var as unset (log level)", () => {
    const env = parseEnv({ NEXT_PUBLIC_LOG_LEVEL: "" });
    expect(env.NEXT_PUBLIC_LOG_LEVEL).toBeUndefined();
  });
});
