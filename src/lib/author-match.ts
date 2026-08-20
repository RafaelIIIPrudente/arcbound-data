// ⚠️ THIS MODULE NO LONGER DESCRIBES HOW ATTRIBUTION WORKS. It once did:
// attribution was a DOWNSTREAM NAME MATCH (ADR 0009), where
// `bi.linkedin_post_latest` INNER JOINed staging to `clients` on
// `clients.name = TRIM(regexp_replace(post_name, '\s*•\s*You\s*$', '', 'i'))`,
// and a post whose author did not match was written and then appeared nowhere.
//
// Under ADR 0010 attribution is the `client_id` foreign key stamped at ingest
// from the Client the operator selected. Nothing is dropped for a name anymore.
//
// These helpers survive as a WRONG-FILE GUARD, and the comparison they perform is
// unchanged — it is simply asked a different question. It used to ask "will these
// posts be attributed?"; it now asks "does the scrape agree that these are the
// selected Client's posts?". A disagreement no longer risks LOSS, it risks
// MISATTRIBUTION: the posts land under the chosen Client whether or not that is
// the right one, and only a human can tell.
//
// ⚠️ Keep the cleaning identical to the historical join anyway. It is what makes
// the evidence on screen legible — a reader shown a stripped " • You" can see
// that it was stripped and still did not match.

/** Strip a trailing " • You" (case-insensitive) and trim. */
export function cleanAuthorName(postName?: string): string {
  return (postName ?? "").replace(/\s*•\s*You\s*$/i, "").trim();
}

/**
 * Non-blocking warning when scraped authors do not match the selected client's
 * name (exact, case-sensitive). Returns null when all match.
 *
 * ⚠️ THE SENTENCE CHANGED WITH ADR 0010 AND THE OLD ONE WAS A LIE THE MOMENT THE
 * READS MOVED. It used to end "…won't appear in analytics until the names align",
 * which was true while attribution was a name match. It is now false twice over:
 * the posts DO appear, and aligning the names changes nothing. What the warning
 * has to convey instead is that they were filed under that client REGARDLESS, so
 * a reader who picked the wrong client can still catch it.
 */
export function nameMatchWarning(
  rows: { post_name?: string }[],
  clientName: string,
): string | null {
  const mismatches = rows.filter((row) => cleanAuthorName(row.post_name) !== clientName).length;
  if (mismatches === 0) return null;

  const total = rows.length;
  const verb = mismatches === 1 ? "post doesn't" : "posts don't";
  return `${mismatches} of ${total} ${verb} match ${clientName} by author name, and ${mismatches === 1 ? "was" : "were"} filed under that client anyway — check the client selection if that isn't right.`;
}

/**
 * One distinct scraped author string in an upload, with what the guard makes of
 * it and how many posts carry it.
 *
 * ⚠️ `postName` IS THE RAW SCRAPED VALUE AND STAYS RAW. ADR 0009 forbids
 * rewriting scraped data, and the raw string is the whole diagnostic value here:
 * it is what shows a reader that the scraper duplicated the name and swept in a
 * `Premium` badge. `cleaned` is shown NEXT TO it, never instead of it — the
 * comparison strips one trailing " • You", and the reader needs to see that it
 * did and that it still did not help.
 */
export interface ScrapedAuthor {
  /** Verbatim `post_name` as the scrape sent it. `""` when the row carried none. */
  postName: string;
  /** What the guard compares against `clients.name` after cleaning. */
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
  /**
   * Posts whose scraped author does not match the selected Client's name.
   *
   * ⚠️ THIS IS A DISAGREEMENT COUNT, NOT A LOSS COUNT (ADR 0010). Every one of
   * these posts is filed under the selected Client; what this counts is how many
   * times the scrape said someone else wrote them.
   */
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
