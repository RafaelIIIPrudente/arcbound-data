import { describe, expect, it, vi } from "vitest";

import type { PostRow } from "@/services/types";

// resolveFormat lives in the ingest seam, which reaches for Supabase at module
// scope. Mock it so this stays hermetic — we only exercise the pure function.
vi.mock("next/headers", () => ({ cookies: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ rpc: vi.fn() }) }));

import { resolveFormat } from "@/services/ingest";

import {
  FORMAT_CHOICES,
  FORMAT_LABELS,
  FORMATS,
  isConfidentFormat,
  isRecognizedFormat,
  toCanonicalFormat,
} from "./post-format";

function makeRow(post_format_type?: string): PostRow {
  return {
    linkedin_post_id: "P1",
    impressions: 1,
    likes: 1,
    comments: 1,
    reposts: 1,
    engagement_rate: 1,
    saves: null,
    post_format_type,
    scraped_at: "2026-07-15T15:25:39.889Z",
  };
}

describe("post format vocabulary", () => {
  it("recognises exactly the ten scraper formats, case-insensitively", () => {
    expect(FORMATS).toEqual([
      "IMAGE",
      "DOCUMENT",
      "VIDEO",
      "TEXT",
      "POLL",
      "ARTICLE",
      "SLIDE_SHOW",
      "SHARE",
      "INSTANT_SHARE",
      "UNKNOWN",
    ]);
    for (const format of FORMATS) {
      expect(isRecognizedFormat(format)).toBe(true);
      expect(isRecognizedFormat(format.toLowerCase())).toBe(true);
    }
    expect(isRecognizedFormat("carousel")).toBe(false);
    expect(isRecognizedFormat("link")).toBe(false);
    expect(isRecognizedFormat("")).toBe(false);
    expect(isRecognizedFormat(undefined)).toBe(false);
  });

  it("treats UNKNOWN as recognised but never confident", () => {
    expect(isRecognizedFormat("UNKNOWN")).toBe(true);
    expect(isConfidentFormat("UNKNOWN")).toBe(false);
    expect(isConfidentFormat("unknown")).toBe(false);
    expect(isConfidentFormat("DOCUMENT")).toBe(true);
    expect(isConfidentFormat("document")).toBe(true);
    expect(isConfidentFormat("carousel")).toBe(false);
    expect(isConfidentFormat("")).toBe(false);
    expect(isConfidentFormat(undefined)).toBe(false);
  });

  it("labels every format for humans, with no raw enum tokens", () => {
    expect(FORMAT_LABELS.SLIDE_SHOW).toBe("Slide show");
    expect(FORMAT_LABELS.INSTANT_SHARE).toBe("Instant share");
    expect(FORMAT_LABELS.DOCUMENT).toBe("Document");
    for (const format of FORMATS) {
      const label = FORMAT_LABELS[format];
      expect(label).toBeTruthy();
      expect(label).not.toMatch(/_|[A-Z]{2,}/); // no SCREAMING_SNAKE leaking to users
    }
  });

  it("offers the nine resolvable formats as review choices, excluding UNKNOWN", () => {
    expect(FORMAT_CHOICES).toHaveLength(9);
    expect(FORMAT_CHOICES).not.toContain("UNKNOWN");
    expect(FORMAT_CHOICES.every((format) => isConfidentFormat(format))).toBe(true);
  });

  it("recognises padded values without letting the trim reach storage", () => {
    expect(isRecognizedFormat(" DOCUMENT ")).toBe(true);
    expect(isRecognizedFormat("\tvideo\n")).toBe(true);
    expect(isConfidentFormat(" DOCUMENT ")).toBe(true);

    // ADR 0009: recognition trims, storage does NOT — the padded value travels
    // to the RPC byte-for-byte as it arrived.
    expect(resolveFormat(makeRow(" DOCUMENT "))).toBe(" DOCUMENT ");
    expect(resolveFormat(makeRow("\tvideo\n"))).toBe("\tvideo\n");
  });
});

describe("toCanonicalFormat", () => {
  it("maps any casing or padding onto the canonical member", () => {
    expect(toCanonicalFormat("image")).toBe("IMAGE");
    expect(toCanonicalFormat(" Image ")).toBe("IMAGE");
    expect(toCanonicalFormat("IMAGE")).toBe("IMAGE");
    expect(toCanonicalFormat("slide_show")).toBe("SLIDE_SHOW");
    expect(toCanonicalFormat("instant_share")).toBe("INSTANT_SHARE");
  });

  it("canonicalises UNKNOWN rather than rejecting it", () => {
    // "which format is this" — NOT "does a human need to review it".
    expect(toCanonicalFormat("unknown")).toBe("UNKNOWN");
    expect(toCanonicalFormat("UNKNOWN")).toBe("UNKNOWN");
    expect(isConfidentFormat("unknown")).toBe(false); // the review gate still says no
  });

  it("returns null for anything outside the vocabulary", () => {
    expect(toCanonicalFormat("carousel")).toBeNull();
    expect(toCanonicalFormat("link")).toBeNull();
    expect(toCanonicalFormat("")).toBeNull();
    expect(toCanonicalFormat(undefined)).toBeNull();
  });
});
