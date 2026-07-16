// Pure normalization + validation for a Client's LinkedIn profile URL.
//
// A Client's identity is a NORMALIZED LinkedIn profile URL (ArcBase v1 spec,
// decision 3): two differently-written URLs that point at the same profile must
// normalize to the same string so duplicates can be detected at the seam. We
// require a canonical `linkedin.com/in/<handle>` profile URL and normalize by
// lowercasing the host AND the handle (LinkedIn vanity handles are
// case-insensitive), forcing https, dropping a leading `www.`, stripping a
// trailing slash, and dropping any query/hash. No I/O — this is a pure function.

export type NormalizeResult =
  { ok: true; value: string } | { ok: false; code: "required" | "invalid"; message: string };

const REQUIRED: Extract<NormalizeResult, { ok: false }> = {
  ok: false,
  code: "required",
  message: "LinkedIn URL is required.",
};

const INVALID: Extract<NormalizeResult, { ok: false }> = {
  ok: false,
  code: "invalid",
  message: "Enter a valid LinkedIn profile URL (e.g. https://linkedin.com/in/handle).",
};

export function normalizeLinkedInUrl(raw: string): NormalizeResult {
  const trimmed = raw.trim();
  if (!trimmed) return REQUIRED;

  // Force a scheme so the URL parser has something to work with. Reject any
  // explicit non-http(s) scheme (e.g. `ftp://`, `javascript:`); otherwise
  // assume https for a scheme-less input like `linkedin.com/in/handle`.
  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(candidate)) return INVALID;
    candidate = `https://${candidate}`;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return INVALID;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "linkedin.com") return INVALID;

  // The path must be exactly `/in/<handle>` (a single, non-empty segment).
  const path = url.pathname.replace(/\/+$/, "");
  const match = /^\/in\/([^/]+)$/.exec(path);
  if (!match) return INVALID;

  const handle = match[1];
  if (handle === undefined) return INVALID;

  // Lowercase the handle: LinkedIn treats `/in/BryanWish` and `/in/bryanwish` as
  // the same profile, so they must normalize equal to close the dup-block hole.
  return { ok: true, value: `https://linkedin.com/in/${handle.toLowerCase()}` };
}

/** Strip the scheme (and any `www.`) for compact display, e.g. `linkedin.com/in/handle`. */
export function displayLinkedInUrl(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
}
