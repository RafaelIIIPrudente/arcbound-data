import { describe, expect, it } from "vitest";

import { displayLinkedInUrl, normalizeLinkedInUrl } from "./linkedin-url";

describe("normalizeLinkedInUrl", () => {
  it("accepts a canonical /in/ profile URL unchanged", () => {
    const result = normalizeLinkedInUrl("https://linkedin.com/in/bryanwish");
    expect(result).toEqual({ ok: true, value: "https://linkedin.com/in/bryanwish" });
  });

  it("forces https", () => {
    const result = normalizeLinkedInUrl("http://linkedin.com/in/bryanwish");
    expect(result).toEqual({ ok: true, value: "https://linkedin.com/in/bryanwish" });
  });

  it("drops a leading www.", () => {
    const result = normalizeLinkedInUrl("https://www.linkedin.com/in/bryanwish");
    expect(result).toEqual({ ok: true, value: "https://linkedin.com/in/bryanwish" });
  });

  it("strips a trailing slash", () => {
    const result = normalizeLinkedInUrl("https://linkedin.com/in/bryanwish/");
    expect(result).toEqual({ ok: true, value: "https://linkedin.com/in/bryanwish" });
  });

  it("strips query and hash", () => {
    const result = normalizeLinkedInUrl("https://linkedin.com/in/bryanwish?utm_source=x#top");
    expect(result).toEqual({ ok: true, value: "https://linkedin.com/in/bryanwish" });
  });

  it("accepts a scheme-less URL and forces https", () => {
    const result = normalizeLinkedInUrl("linkedin.com/in/bryanwish");
    expect(result).toEqual({ ok: true, value: "https://linkedin.com/in/bryanwish" });
  });

  it("lowercases the host and the handle (LinkedIn vanity handles are case-insensitive)", () => {
    const result = normalizeLinkedInUrl("https://LINKEDIN.com/in/BryanWish");
    expect(result).toEqual({ ok: true, value: "https://linkedin.com/in/bryanwish" });
  });

  it("treats handle-case variants as the same profile", () => {
    const a = normalizeLinkedInUrl("https://linkedin.com/in/BryanWish");
    const b = normalizeLinkedInUrl("https://linkedin.com/in/bryanwish");
    expect(a.ok && b.ok).toBe(true);
    expect(a.ok && a.value).toBe(b.ok && b.value);
  });

  it("normalizes two differently-written URLs to the same value", () => {
    const a = normalizeLinkedInUrl("http://www.linkedin.com/in/bryanwish/");
    const b = normalizeLinkedInUrl("https://linkedin.com/in/bryanwish?ref=share");
    expect(a.ok && b.ok).toBe(true);
    expect(a.ok && a.value).toBe(b.ok && b.value);
  });

  it("rejects an empty string as required", () => {
    expect(normalizeLinkedInUrl("")).toMatchObject({ ok: false, code: "required" });
  });

  it("rejects whitespace-only input as required", () => {
    expect(normalizeLinkedInUrl("   ")).toMatchObject({ ok: false, code: "required" });
  });

  it("rejects a non-profile linkedin path as invalid", () => {
    expect(normalizeLinkedInUrl("https://linkedin.com/company/acme")).toMatchObject({
      ok: false,
      code: "invalid",
    });
  });

  it("rejects a non-linkedin host as invalid", () => {
    expect(normalizeLinkedInUrl("https://example.com/in/bryanwish")).toMatchObject({
      ok: false,
      code: "invalid",
    });
  });

  it("rejects garbage input as invalid", () => {
    expect(normalizeLinkedInUrl("not a url")).toMatchObject({ ok: false, code: "invalid" });
  });

  it("rejects an empty handle as invalid", () => {
    expect(normalizeLinkedInUrl("https://linkedin.com/in/")).toMatchObject({
      ok: false,
      code: "invalid",
    });
  });

  it("rejects a deeper sub-path as invalid", () => {
    expect(normalizeLinkedInUrl("https://linkedin.com/in/bryanwish/detail/skills")).toMatchObject({
      ok: false,
      code: "invalid",
    });
  });
});

describe("displayLinkedInUrl", () => {
  it("strips the scheme for display", () => {
    expect(displayLinkedInUrl("https://linkedin.com/in/bryanwish")).toBe(
      "linkedin.com/in/bryanwish",
    );
  });
});
