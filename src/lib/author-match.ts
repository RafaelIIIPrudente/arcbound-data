// Client attribution is a DOWNSTREAM NAME MATCH (ADR 0009): the BI view
// `bi.linkedin_post_latest` INNER JOINs staging to `clients` on
// `clients.name = TRIM(regexp_replace(post_name, '\s*•\s*You\s*$', '', 'i'))`.
// These pure helpers mirror that cleaning so the upload flow can warn (never
// block) when scraped authors won't match the selected client's name.

/** Strip a trailing " • You" (case-insensitive) and trim — mirrors the BI join. */
export function cleanAuthorName(postName?: string): string {
  return (postName ?? "").replace(/\s*•\s*You\s*$/i, "").trim();
}

/**
 * Non-blocking warning when scraped authors won't match the selected client's
 * name (exact, case-sensitive — the BI join is exact). Returns null when all
 * match, otherwise "N of M post(s) … won't appear in analytics until the names
 * align."
 */
export function nameMatchWarning(
  rows: { post_name?: string }[],
  clientName: string,
): string | null {
  const mismatches = rows.filter((row) => cleanAuthorName(row.post_name) !== clientName).length;
  if (mismatches === 0) return null;

  const total = rows.length;
  const verb = mismatches === 1 ? "post doesn't" : "posts don't";
  return `${mismatches} of ${total} ${verb} match ${clientName} and won't appear in analytics until the names align.`;
}

/**
 * One distinct scraped author string in an upload, with what the BI join makes
 * of it and how many posts carry it.
 *
 * ⚠️ `postName` IS THE RAW SCRAPED VALUE AND STAYS RAW. ADR 0009 forbids
 * rewriting scraped data, and the raw string is the whole diagnostic value here:
 * it is what shows a reader that the scraper duplicated the name and swept in a
 * `Premium` badge. `cleaned` is shown NEXT TO it, never instead of it — the join
 * strips one trailing " • You", and the reader needs to see that it did and that
 * it still did not help.
 */
export interface ScrapedAuthor {
  /** Verbatim `post_name` as the scrape sent it. `""` when the row carried none. */
  postName: string;
  /** What the BI join actually compares against `clients.name`. */
  cleaned: string;
  /** Posts in this upload carrying this exact scraped string. */
  count: number;
  /** Whether `cleaned` equals the client's name (exact, case-sensitive). */
  matches: boolean;
}

/** The evidence behind a name-match decision, for a screen rather than a sentence. */
export interface AuthorMatchReport {
  /** `clients.name` as ArcBase holds it — the other side of the comparison. */
  clientName: string;
  /** Distinct scraped authors: mismatches first, commonest first. */
  authors: ScrapedAuthor[];
  /** Posts in the upload. */
  total: number;
  /** Posts whose author will not match, so will not appear in analytics. */
  mismatched: number;
}

/**
 * Group an upload's rows by their raw scraped author and mark which will match.
 *
 * ⚠️ STRUCTURE, NOT A SENTENCE, AND THAT IS THE POINT. `nameMatchWarning` above
 * returns "14 of 14 posts don't match …" — a verdict, fine for the post-write
 * summary. This returns the strings themselves, because a confirmation screen
 * has to let someone DIAGNOSE: seeing
 * `Eitan Hoenig Eitan Hoenig • You Premium • You (14)` beside `Eitan Hoenig` is
 * what tells them the scraper is at fault and which person to take it to. Both
 * helpers stay — they answer different questions on different screens.
 *
 * Pure and dependency-free, like the rest of this module: it is pulled into the
 * client bundle.
 */
export function authorMatchReport(
  rows: { post_name?: string }[],
  clientName: string,
): AuthorMatchReport {
  const byName = new Map<string, ScrapedAuthor>();

  for (const row of rows) {
    const postName = row.post_name ?? "";
    const existing = byName.get(postName);
    if (existing) {
      existing.count += 1;
      continue;
    }
    const cleaned = cleanAuthorName(postName);
    byName.set(postName, { postName, cleaned, count: 1, matches: cleaned === clientName });
  }

  // Mismatches first (the reason the screen exists), then commonest first, then
  // by name so the order is deterministic for identical counts.
  const authors = [...byName.values()].sort(
    (a, b) =>
      Number(a.matches) - Number(b.matches) ||
      b.count - a.count ||
      a.postName.localeCompare(b.postName),
  );

  return {
    clientName,
    authors,
    total: rows.length,
    mismatched: authors.reduce((sum, a) => sum + (a.matches ? 0 : a.count), 0),
  };
}
