import type { PostFormat } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// The Post format vocabulary — the ONE place the scraper's format types live.
//
// Deliberately dependency-free (type-only import): this module is pulled into
// the client bundle by the Format Review dropdown, so it must never drag a
// parser or validator along with it.
//
// ADR 0009: recognition here is case-insensitive and whitespace-tolerant, but
// NOTHING in this module is ever written to the database. Storage stays
// byte-for-byte raw — callers keep the value exactly as the Scrape sent it.
// ─────────────────────────────────────────────────────────────────────────────

/** The ten format types the scraper emits — the ONLY such list in the codebase. */
export const FORMATS: readonly PostFormat[] = [
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
];

/** Human-readable labels — the only format text ever shown to staff. */
export const FORMAT_LABELS: Record<PostFormat, string> = {
  IMAGE: "Image",
  DOCUMENT: "Document",
  VIDEO: "Video",
  TEXT: "Text",
  POLL: "Poll",
  ARTICLE: "Article",
  SLIDE_SHOW: "Slide show",
  SHARE: "Share",
  INSTANT_SHARE: "Instant share",
  UNKNOWN: "Unknown",
};

/**
 * The formats staff may pick during Format Review — the ten minus UNKNOWN.
 * Choosing "unknown" is not a resolution; the Skip action covers "trust the
 * scraper". Derived from FORMATS so the vocabulary stays in one place.
 */
export const FORMAT_CHOICES: readonly PostFormat[] = FORMATS.filter(
  (format) => format !== "UNKNOWN",
);

/** normalised form → canonical member. Backs both recognition and canonicalisation. */
const CANONICAL_BY_NORMALIZED = new Map<string, PostFormat>(
  FORMATS.map((format) => [format.toLowerCase(), format]),
);

// Recognition only — the normalised form is NEVER stored (ADR 0009).
function normalize(format?: string): string {
  return typeof format === "string" ? format.trim().toLowerCase() : "";
}

/**
 * RECOGNITION — is this a value we understand? Case-insensitive membership in
 * the ten. UNKNOWN is recognised: it is legal to store, just not informative.
 *
 * Deliberately NOT a type predicate: a recognised value may be any casing (e.g.
 * "image"), which is not assignable to PostFormat.
 */
export function isRecognizedFormat(format?: string): boolean {
  return CANONICAL_BY_NORMALIZED.has(normalize(format));
}

/**
 * CONFIDENCE — can a human skip reviewing this? Recognised AND not UNKNOWN.
 * This is the predicate that gates Format Review.
 */
export function isConfidentFormat(format?: string): boolean {
  const normalized = normalize(format);
  return CANONICAL_BY_NORMALIZED.has(normalized) && normalized !== "unknown";
}

/**
 * CANONICALISATION — WHICH format is this? Answers identity, not reviewability:
 * `toCanonicalFormat("unknown")` is `"UNKNOWN"`, not null, because UNKNOWN is a
 * real member of the vocabulary. Use `isConfidentFormat` to decide whether a
 * human must review it.
 *
 * For grouping/reporting only. Because storage stays raw (ADR 0009), staging can
 * hold mixed-case variants of one format; group by this, never by the raw string.
 */
export function toCanonicalFormat(value?: string): PostFormat | null {
  return CANONICAL_BY_NORMALIZED.get(normalize(value)) ?? null;
}
