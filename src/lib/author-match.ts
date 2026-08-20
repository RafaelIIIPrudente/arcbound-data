// ⚠️ THIS MODULE NO LONGER DESCRIBES HOW ATTRIBUTION WORKS. It once did:
// attribution was a DOWNSTREAM NAME MATCH (ADR 0009), where
// `bi.linkedin_post_latest` INNER JOINed staging to `clients` on
// `clients.name = TRIM(regexp_replace(post_name, '\s*•\s*You\s*$', '', 'i'))`,
// and a post whose author did not match was written and then appeared nowhere.
//
// Under ADR 0010 attribution is the `client_id` foreign key stamped at ingest
// from the Client the operator selected. Nothing is dropped for a name anymore.
//
// These helpers survive as a WRONG-FILE GUARD: they no longer ask "will these
// posts be attributed?" but "does the scrape agree that these are the selected
// Client's posts?". A disagreement no longer risks LOSS, it risks
// MISATTRIBUTION: the posts land under the chosen Client whether or not that is
// the right one, and only a human can tell.
//
// ⚠️ AND THE COMPARISON ITSELF MOVED ON 2026-08-20 — see
// docs/decisions/2026-08-20-badge-decorated-author-names.md. It used to be the
// historical join's cleaning and nothing else, which fired the gate on every
// Premium and every Verified account. It is now the RESIDUE RULE below, of which
// the historical cleaning is still the first and commonest case.

/** Strip a trailing " • You" (case-insensitive) and trim. */
export function cleanAuthorName(postName?: string): string {
  return (postName ?? "").replace(/\s*•\s*You\s*$/i, "").trim();
}

/**
 * ⚠️ EVIDENCED, NEVER GUESSED, AND THAT IS WHY THIS LIST IS SO SHORT. `Premium`
 * and `Verified` are the only badges any real scraped string in this repo has
 * ever carried (prod 2026-08-18 and 2026-08-20). `Influencer`, `Open to work`,
 * `Hiring` and anything else LinkedIn ships later are DELIBERATELY absent.
 *
 * An unknown badge therefore fires the gate and puts itself on the screen as an
 * unaccounted-for residue. That is the fail-safe direction: an unmapped
 * vocabulary value is disclosed, never silently swallowed. The cost is one round
 * of friction the first time a new badge appears; the benefit is that the fix is
 * then a one-line change driven by evidence instead of by guesswork.
 */
const KNOWN_BADGES = ["Premium", "Verified"] as const;

/**
 * LinkedIn author-block chrome: the " • You" marker (any position, not just
 * trailing) and the known badges. Case-insensitive — unlike the NAME comparison,
 * which stays exact. Widening one without the other is deliberate.
 *
 * ⚠️ STICKY (`y`), NOT GLOBAL. It is tested at ONE position at a time by the
 * scanner below, never swept across the whole string — see `accountFor`.
 */
const CHROME_AT = new RegExp(String.raw`•\s*You|(?:${KNOWN_BADGES.join("|")})\b`, "iy");

/**
 * Whether a known badge appears ANYWHERE in a string.
 *
 * ⚠️ SEPARATE FROM `CHROME_AT` ON PURPOSE. That one is sticky and answers "can I
 * account for this position?"; this one answers "was a badge among what I
 * accounted for?", which is what the upload note needs to describe truthfully.
 */
const BADGE_ANYWHERE = new RegExp(String.raw`\b(?:${KNOWN_BADGES.join("|")})\b`, "i");

/** What the scan could account for, and whether the Client's own name was part of it. */
interface Accounting {
  /** What could NOT be accounted for, whitespace-collapsed. */
  residue: string;
  /** Whether the Client's name was consumed AS the name — not merely present as a substring. */
  nameFound: boolean;
}

/** What the guard makes of one scraped author string. */
export type AuthorVerdict =
  /** The historical exact match: the Client's name, optionally with one trailing " • You". */
  | "match"
  /**
   * The Client's name accompanied by known chrome, IN ANY ARRANGEMENT — not a
   * different person.
   *
   * ⚠️ NOT A SHAPE. The decision record sketches the corpus as
   * `{Name} {Name} • You {Badge} • You`, but nothing pins that order and nothing
   * should: `"Ann Ann Ann"` (no chrome) and `"Premium Verified • You Raj Singh"`
   * both qualify. Pinning the arrangement is how the next scraper change breaks
   * this, so the rule is position-free on purpose.
   */
  | "artifact"
  /** Anything else. The scrape is naming someone this Client is not. */
  | "mismatch";

/**
 * ⚠️ THE TRUSTED VALUE COMES FROM OUR OWN DATABASE. This does NOT normalise the
 * scrape toward a name and hope the result is equal — that would be guessing
 * which half of a mangled string is the real name, which is what the old refusal
 * rightly forbade. It INVERTS the comparison: take `clients.name` as ArcBase
 * holds it, account for it and for known chrome wherever they appear in the
 * scraped string, and report what is left over. Nothing is ever inferred from
 * the scrape.
 *
 *     "Raj Singh Raj Singh • You Verified • You"
 *       "Raj Singh" ×2, "• You" ×2, "Verified" ×1  →  residue ""
 *
 * ⚠️ THERE IS NO STRIPPING ORDER, AND THAT IS THE WHOLE POINT. This used to run
 * two sequential passes — remove the name everywhere, then remove chrome — and
 * BOTH orders are wrong, each breaking a case the other survives:
 *
 *   name first, then chrome   Client "Prem" · "Prem • You Premium • You"
 *                             removing "Prem" fragments "Premium" into "ium",
 *                             which `Premium` can then no longer match. The row
 *                             gated forever on a residue naming no badge at all.
 *   chrome first, then name   Client "Premium Care" · their own name loses its
 *                             "Premium" to the badge list, so they never match.
 *
 * So nothing is stripped in sequence. The string is SCANNED once, left to right,
 * and at each position the longest thing that can be accounted for — the
 * Client's name or one chrome token — is consumed. Position-free by
 * construction: the name and the chrome may appear in any arrangement, any
 * number of times.
 *
 * ⚠️ AND THE SCAN REPORTS WHETHER THE NAME WAS ACTUALLY CONSUMED, which a
 * substring test cannot. `"• You Premium • You"` CONTAINS "Prem", but only
 * inside the badge — the Client's name never appears, and crediting it would
 * have read pure chrome as that Client's own post.
 *
 * The residue is a MEASUREMENT — what could not be accounted for — and never a
 * corrected name. ADR 0009 still binds: nothing here is written anywhere.
 */
function accountFor(postName: string, clientName: string): Accounting {
  const leftover: string[] = [];
  let nameFound = false;
  let i = 0;

  while (i < postName.length) {
    const ch = postName[i]!;
    if (/\s/.test(ch)) {
      leftover.push(" ");
      i += 1;
      continue;
    }

    // The two things that can be accounted for HERE, measured independently.
    const nameLen = clientName !== "" && postName.startsWith(clientName, i) ? clientName.length : 0;
    CHROME_AT.lastIndex = i;
    const chromeLen = CHROME_AT.exec(postName)?.[0].length ?? 0;

    // ⚠️ LONGEST WINS, AND TIES GO TO THE CLIENT'S NAME. Length is what breaks
    // the prefix collision in both directions: at "Premium" a Client called
    // "Prem" loses (4 < 7) so the badge stays whole, while a Client called
    // "Premium Care" wins (12 > 7) so their own name is never eaten. The tie
    // rule favours the trusted side — `clients.name` — over a guess.
    if (nameLen > 0 && nameLen >= chromeLen) {
      nameFound = true;
      leftover.push(" ");
      i += nameLen;
    } else if (chromeLen > 0) {
      leftover.push(" ");
      i += chromeLen;
    } else {
      leftover.push(ch);
      i += 1;
    }
  }

  return { residue: leftover.join("").replace(/\s+/g, " ").trim(), nameFound };
}

/**
 * THE SHARED PREDICATE. Both `nameMatchWarning` and `authorMatchReport` derive
 * from this, so the confirm gate and the post-write summary cannot disagree.
 */
export function classifyAuthor(
  postName: string,
  clientName: string,
): { verdict: AuthorVerdict; residue: string } {
  // ⚠️ THE EMPTY-STRING GUARD. Stripping nothing from nothing leaves nothing, so
  // a bare residue test would read a row with NO AUTHOR as a match. A missing
  // author is not evidence that the author is this Client — it is the absence of
  // evidence, and the two must never collapse. (The containment requirement
  // below independently closes the same hole; this states it where a reader
  // looking for it will find it.)
  if (postName.trim() === "" || clientName.trim() === "") {
    return { verdict: "mismatch", residue: postName.trim() };
  }

  // The historical exact rule, unchanged, and still the commonest case by far.
  // ⚠️ KEPT SEPARATE FROM THE RESIDUE RULE ON PURPOSE: an ordinary
  // "Bryan Wish • You" is not a decorated author block, and counting it as one
  // would put a notice on every upload that has ever been clean.
  if (cleanAuthorName(postName) === clientName) return { verdict: "match", residue: "" };

  const { residue, nameFound } = accountFor(postName, clientName);

  // ⚠️ THE CLIENT'S NAME MUST ACTUALLY HAVE BEEN CONSUMED. Without this, a string
  // made of nothing but chrome — "• You Premium • You" — accounts for completely
  // and would read as this Client's own post. It is a NECESSARY condition, never
  // a sufficient one: "Raj Singhania" consumes "Raj Singh" and is still a
  // mismatch, because the residue "ania" is not empty. That pairing is the whole
  // defence against the substring trap.
  //
  // ⚠️ `nameFound`, NOT `postName.includes(clientName)`. The substring test said
  // yes for a Client called "Prem" against "• You Premium • You", where the only
  // "Prem" in the string belongs to the badge — the scan credits the name only
  // where it was actually taken as the name.
  if (!nameFound) return { verdict: "mismatch", residue };

  return residue === "" ? { verdict: "artifact", residue } : { verdict: "mismatch", residue };
}

/**
 * Non-blocking warning when scraped authors do not match the selected client's
 * name. Returns null when nothing genuinely disagrees.
 *
 * ⚠️ THE SENTENCE CHANGED WITH ADR 0010 AND THE OLD ONE WAS A LIE THE MOMENT THE
 * READS MOVED. It used to end "…won't appear in analytics until the names align",
 * which was true while attribution was a name match. It is now false twice over:
 * the posts DO appear, and aligning the names changes nothing. What the warning
 * has to convey instead is that they were filed under that client REGARDLESS, so
 * a reader who picked the wrong client can still catch it.
 *
 * ⚠️ AND IT COUNTS GENUINE DISAGREEMENTS ONLY. A decorated author block is the
 * Client's own name in LinkedIn's chrome, so it is not a disagreement and must
 * not be reported as one — `decoratedAuthorNote` records those instead.
 */
export function nameMatchWarning(report: AuthorMatchReport): string | null {
  // ⚠️ DERIVED FROM THE REPORT, NOT COMPUTED IN PARALLEL — AND NOW IT TAKES THE
  // REPORT ITSELF. It used to take the raw rows and rebuild one internally, so a
  // caller holding a report (which every caller does — the gate computes one
  // before the write) paid to classify the same strings twice, and the two
  // objects were free to disagree if anything ever made classification
  // stateful. Same shape as `decoratedAuthorNote`, its sibling on this screen.
  const { mismatched, total, clientName } = report;
  if (mismatched === 0) return null;

  const verb = mismatched === 1 ? "post doesn't" : "posts don't";
  return `${mismatched} of ${total} ${verb} match ${clientName} by author name, and ${mismatched === 1 ? "was" : "were"} filed under that client anyway — check the client selection if that isn't right.`;
}

/**
 * The NON-BLOCKING note recording that the scraper sent LinkedIn's whole author
 * block. Returns null when nothing was decorated.
 *
 * ⚠️ THIS IS A RECORD, NOT A WARNING, AND THE COPY HAS TO STAY THAT WAY. Nothing
 * went wrong: the posts are filed correctly and the operator did nothing to fix.
 * It exists so the fact stays visible rather than being silently absorbed —
 * Bryan's call, 2026-08-20: "keep a note in the upload summary, no blocking
 * gate."
 *
 * ⚠️ AND IT MUST NEVER TELL ANYONE TO ALIGN THE NAMES. A previous version of
 * this exact copy shipped that instruction; under ADR 0010 aligning names
 * changes nothing at all, so it sends a reader to perform a ritual.
 */
export function decoratedAuthorNote(report: AuthorMatchReport): string | null {
  const decoratedAuthors = report.authors.filter((a) => a.verdict === "artifact");
  if (decoratedAuthors.length === 0) return null;

  // ⚠️ ONE DERIVATION OF ARTIFACT-NESS, NOT TWO. This read `report.decorated`
  // while the line above filtered on the verdict — the same fact computed two
  // ways, free to drift the moment either changes. The count now comes from the
  // rows it is describing.
  const posts = decoratedAuthors.reduce((sum, a) => sum + a.count, 0);
  // The RAW strings, so the note is diagnosable rather than merely reassuring.
  const scraped = decoratedAuthors.map((a) => a.postName).join(", ");

  // ⚠️ WHAT WAS ACTUALLY FOUND, NOT A SHAPE ASSUMED IN ADVANCE. The note used to
  // end, unconditionally, "The repeated name and the badge come from the
  // scraper" — and open with "the whole author block". Both overclaim: an
  // artifact is the Client's name plus known chrome in ANY arrangement, so
  // "Raj Singh Premium" carries a badge and no repetition, and
  // "Raj Singh Raj Singh" carries a repetition and no badge. Each made the note
  // assert something that was not in the strings it was describing, in
  // staff-facing copy on the only screen that records the fact at all.
  const repeated = decoratedAuthors.some((a) => a.postName.split(report.clientName).length > 2);
  const badged = decoratedAuthors.some((a) => BADGE_ANYWHERE.test(a.postName));
  const provenance = repeated
    ? badged
      ? "The repeated name and the badge come from the scraper, not from ArcBase."
      : "The repeated name comes from the scraper, not from ArcBase."
    : badged
      ? "The badge comes from the scraper, not from ArcBase."
      : "The extra text around the name comes from the scraper, not from ArcBase.";

  return `On ${posts} ${posts === 1 ? "post" : "posts"} the scraped author carried more than ${report.clientName}'s name — ${scraped}. ArcBase read ${posts === 1 ? "it" : "them"} as ${report.clientName} and filed ${posts === 1 ? "it" : "them"} under that client. ${provenance}`;
}

/**
 * One distinct scraped author string in an upload, with what the guard makes of
 * it and how many posts carry it.
 *
 * ⚠️ `postName` IS THE RAW SCRAPED VALUE AND STAYS RAW. ADR 0009 forbids
 * rewriting scraped data, and the raw string is the whole diagnostic value here:
 * it is what shows a reader that the scraper duplicated the name and swept in a
 * badge. `residue` is shown NEXT TO it, never instead of it.
 */
export interface ScrapedAuthor {
  /** Verbatim `post_name` as the scrape sent it. `""` when the row carried none. */
  postName: string;
  /**
   * What was left after removing the Client's name and known chrome — i.e. what
   * the guard could NOT account for. `""` for a match or an artifact.
   *
   * ⚠️ THIS REPLACED `cleaned`, WHICH HAD STOPPED DESCRIBING THE COMPARISON.
   * `cleaned` was the scraped string with one trailing " • You" removed, shown as
   * "matched as: …" so a reader could see what was actually compared. The
   * predicate no longer compares that value to anything, so the line explained a
   * rule the code had stopped applying.
   */
  residue: string;
  /** Posts in this upload carrying this exact scraped string. */
  count: number;
  /** ⚠️ THREE STATES, NOT A BOOLEAN — an artifact is neither a match nor a disagreement. */
  verdict: AuthorVerdict;
}

/** The evidence behind a name-match decision, for a screen rather than a sentence. */
export interface AuthorMatchReport {
  /** `clients.name` as ArcBase holds it — the trusted side of the comparison. */
  clientName: string;
  /** Distinct scraped authors: mismatches first, then artifacts, then matches. */
  authors: ScrapedAuthor[];
  /** Posts in the upload. */
  total: number;
  /**
   * Posts whose scraped author is someone this Client is not.
   *
   * ⚠️ THIS IS A DISAGREEMENT COUNT, NOT A LOSS COUNT (ADR 0010). Every one of
   * these posts is filed under the selected Client; what this counts is how many
   * times the scrape said someone else wrote them.
   *
   * ⚠️ AND IT EXCLUDES DECORATED BLOCKS. Those are counted by `decorated`, which
   * is a different fact with a different consequence — a note, not a gate.
   */
  mismatched: number;
  /** Posts whose author was this Client's name plus known LinkedIn chrome, in any arrangement. */
  decorated: number;
}

/**
 * Group an upload's rows by their raw scraped author and classify each one.
 *
 * ⚠️ STRUCTURE, NOT A SENTENCE, AND THAT IS THE POINT. `nameMatchWarning` above
 * returns "14 of 14 posts don't match …" — a verdict, fine for the post-write
 * summary. This returns the strings themselves, because a confirmation screen
 * has to let someone DIAGNOSE: seeing the scraped string beside `Raj Singh` is
 * what tells them which token could not be accounted for and who to take it to.
 * Both helpers stay — they answer different questions on different screens.
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
    const { verdict, residue } = classifyAuthor(postName, clientName);
    byName.set(postName, { postName, residue, count: 1, verdict });
  }

  // Ranked by how much attention each deserves — genuine mismatches (the reason
  // the screen exists), then artifacts (worth recording, not worth stopping
  // for), then plain matches. Commonest first inside a rank, then by name so the
  // order is deterministic for identical counts.
  const rank: Record<AuthorVerdict, number> = { mismatch: 0, artifact: 1, match: 2 };
  const authors = [...byName.values()].sort(
    (a, b) =>
      rank[a.verdict] - rank[b.verdict] ||
      b.count - a.count ||
      a.postName.localeCompare(b.postName),
  );

  const countWhere = (verdict: AuthorVerdict) =>
    authors.reduce((sum, a) => sum + (a.verdict === verdict ? a.count : 0), 0);

  return {
    clientName,
    authors,
    total: rows.length,
    mismatched: countWhere("mismatch"),
    decorated: countWhere("artifact"),
  };
}
