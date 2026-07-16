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
