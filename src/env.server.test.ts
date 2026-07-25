import { describe, expect, it } from "vitest";

import { parseServerEnv } from "./env.server";

describe("parseServerEnv", () => {
  it("accepts a signing secret of at least 32 characters", () => {
    const secret = "x".repeat(40);
    expect(parseServerEnv({ REPORT_LINK_SIGNING_SECRET: secret })).toEqual({
      REPORT_LINK_SIGNING_SECRET: secret,
    });
  });

  it("treats an absent secret as undefined (does NOT throw — the gate fails closed at use)", () => {
    expect(parseServerEnv({})).toEqual({ REPORT_LINK_SIGNING_SECRET: undefined });
  });

  it("coerces a set-but-empty secret to undefined (Docker/CI '') rather than failing", () => {
    expect(parseServerEnv({ REPORT_LINK_SIGNING_SECRET: "" })).toEqual({
      REPORT_LINK_SIGNING_SECRET: undefined,
    });
  });

  it("rejects a present-but-too-short secret (a weak HMAC key)", () => {
    expect(() => parseServerEnv({ REPORT_LINK_SIGNING_SECRET: "short" })).toThrow(
      /Invalid server environment variables/,
    );
  });
});
