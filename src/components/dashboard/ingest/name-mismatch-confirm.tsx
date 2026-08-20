"use client";

import { Button } from "@/components/ui/button";
import type { AuthorMatchReport, ScrapedAuthor } from "@/lib/author-match";

/**
 * The confirmation shown BEFORE a metrics upload writes, when the scraped author
 * names will not match the selected Client.
 *
 * ⚠️ THIS SCREEN EXISTS BECAUSE THE OLD ONE ARRIVED TOO LATE. The same fact used
 * to be computed after `ingestMetrics` had already written and shown as a line of
 * grey text beneath a green "Upload complete" summary. Fourteen posts were lost
 * that way: the app knew, and said so only once nothing could be done about it
 * (docs/decisions/2026-08-18-name-match-attribution-failure.md).
 *
 * ⚠️ IT SHOWS THE RAW SCRAPED STRINGS, NOT A COUNT. "14 of 14 posts won't match"
 * is a verdict; `Eitan Hoenig Eitan Hoenig • You Premium • You (14 posts)` beside
 * `Eitan Hoenig` is a diagnosis — a reader can see the duplicated name and the
 * stray badge, and knows to take it to whoever owns the scraper.
 *
 * ⚠️ AND IT OFFERS NO "FIX IT FOR ME". Normalising the scraped value toward a
 * name would mean guessing which half of a mangled string is the real one, and
 * ADR 0009 forbids rewriting scraped values regardless. The only lever here is
 * human.
 *
 * ⚠️ WHAT THAT REFUSAL DOES **NOT** COVER, SINCE 2026-08-20. The sentence above
 * used to end "…which is how a post gets attributed to the WRONG client", and
 * that reasoning died with ADR 0010: the name is no longer anywhere in the
 * attribution path, so accounting for LinkedIn's chrome cannot misattribute
 * anything — it can only decide whether a notice appears. So ArcBase now takes
 * `clients.name` FROM ITS OWN DATABASE, strips it and the badges it knows out of
 * the scraped string, and asks whether anything is left. The trusted side of
 * that comparison is never inferred from the scrape, which is why it is not
 * guessing. What reaches this screen is what could NOT be accounted for.
 * See docs/decisions/2026-08-20-badge-decorated-author-names.md.
 *
 * ⚠️ THE CONSEQUENCE ON THIS SCREEN CHANGED WITH ADR 0010, AND THE COPY CHANGED
 * WITH IT IN THE SAME COMMIT. Attribution used to be a downstream name match, so
 * a mismatch meant the posts uploaded and then appeared NOWHERE — and every
 * sentence here said so. Attribution is now the `client_id` foreign key stamped
 * from the selection the operator made on the form, so nothing is lost: these
 * posts are filed under the chosen Client whatever the scrape calls their author.
 *
 * The gate is kept and REPURPOSED, exactly as ADR 0010 says: from an attribution
 * mechanism into a WRONG-FILE GUARD. The danger flipped from LOSS to
 * MISATTRIBUTION, and the two have different remedies — loss was fixed by making
 * the names agree, misattribution is fixed by changing the client selection or
 * the file. A screen still describing the old consequence would send staff to
 * chase a name alignment that now affects nothing.
 */
export function NameMismatchConfirm({
  report,
  pending,
  onConfirm,
  onBack,
}: {
  report: AuthorMatchReport;
  pending: boolean;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const { clientName, authors, total, mismatched, decorated } = report;
  // ⚠️ THREE STATES, THREE COUNTS — DO NOT COLLAPSE THEM BACK INTO TWO. This was
  // `matching = total - mismatched`, described as "the rows the scrape and the
  // selection AGREE about". That was true while there were only two states, and
  // it was renamed from `willAppear` when ADR 0010 stopped posts disappearing.
  //
  // It went stale on 2026-08-20, when the decorated-author-block slice made a
  // third state: that subtraction quietly swept `decorated` in with the plain
  // matches, so a MIXED upload told the reader "The other 59 carry a matching
  // author name" while the row list one line below correctly labelled those very
  // rows "author matches + badge". A summary contradicting its own evidence, on
  // the one screen whose entire purpose is diagnosis, is worse than either
  // error alone. `total` still equals `mismatched + decorated + matched`.
  const matched = total - mismatched - decorated;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-lg border bg-card p-6">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="size-2.5 rounded-full bg-amber-500" aria-hidden />
          <span className="font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
            Nothing has been uploaded yet
          </span>
        </div>

        <h2 className="font-display text-lg font-bold tracking-tight">
          {mismatched === total
            ? `The author on these posts isn't ${clientName}`
            : `Some of these posts have a different author`}
        </h2>

        {/* ⚠️ THE MECHANISM, NOT JUST THE OUTCOME. Staff cannot act on a bare
            outcome; they can act on "we file by your selection, not by the row".
            That sentence is also what tells them the remedy is the dropdown
            above rather than a conversation about names. */}
        <p className="mt-1.5 text-sm text-muted-foreground">
          <strong className="font-semibold text-foreground">
            {mismatched} of {total}
          </strong>{" "}
          {total === 1 ? "post carries" : "posts carry"} an author name that doesn&rsquo;t match
          this client. ArcBase files posts by the client you selected, not by the author on the row
          — so {total === 1 ? "it is" : "they are"} filed under {clientName} anyway. If that is
          wrong, go back and change the client, or upload a different file.
          {remainderSentence(matched, decorated, clientName)}
        </p>

        <div className="mt-5 border-t pt-4">
          <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            ArcBase has this client as
          </div>
          <div className="mt-1 font-mono text-sm break-all">{clientName}</div>
        </div>

        <div className="mt-4 border-t pt-4">
          <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            The scrape says
          </div>
          <div className="mt-2 space-y-3">
            {authors.map((author) => (
              <AuthorRow key={author.postName} author={author} clientName={clientName} />
            ))}
          </div>
        </div>

        {/* ⚠️ POINTS AT THE ACTUAL OWNER. Without this the reader is told they
            have a problem and given nowhere to take it.

            ⚠️ AND IT NAMES THE BADGES ARCBASE KNOWS, WHICH IT DID NOT BEFORE.
            This used to read "a badge (Premium)" as an example of what fires
            this screen — true until 2026-08-20, and false from the moment
            Premium and Verified stopped reaching it. Every badge on this screen
            is now one ArcBase could NOT account for, so saying which ones it CAN
            is what tells a reader this is new vocabulary rather than a bug. */}
        <p className="mt-5 border-t pt-4 font-mono text-[10.5px] leading-relaxed text-muted-foreground/80">
          A name that repeats itself or carries a badge is the scraper capturing LinkedIn&rsquo;s
          whole author block. ArcBase accounts for the badges it knows — Premium and Verified —
          without asking; anything left over is shown above. That is fixed at the scrape, not here —
          ArcBase never rewrites a scraped value.
        </p>
      </div>

      <div className="flex gap-3">
        {/* ⚠️ "GO BACK" IS THE PRIMARY, AND THE INVERSION IS DELIBERATE. Format
            Review's primary is its careful option; here the careful option is the
            one that does NOT write. Making "Upload anyway" the default target
            would put the consequence-bearing action under a finger that is
            already moving. */}
        <Button disabled={pending} onClick={onBack}>
          Go back
        </Button>
        {/* ⚠️ THE LABEL DOES NOT CHANGE WHILE PENDING. Swapping it to "Uploading…"
            renames the control mid-flight, so anything addressing it by name — a
            screen reader announcing it, a test asserting it is disabled — loses
            track of it at exactly the moment it matters. `disabled` already says
            the state. */}
        <Button variant="outline" disabled={pending} onClick={onConfirm}>
          Upload anyway
        </Button>
      </div>
    </div>
  );
}

/**
 * The rows this screen is NOT stopping for — and there are two kinds of them.
 *
 * ⚠️ THE WHOLE REASON THIS IS A FUNCTION AND NOT A SUBTRACTION. A plain match and
 * a decorated author block are both "not a mismatch", which is exactly the
 * two-state reading that let `total - mismatched` describe 59 decorated rows as
 * carrying "a matching author name". They are different facts about different
 * strings, so they get different sentences — and when an upload holds both, both
 * counts are stated rather than one being folded into the other.
 *
 * ⚠️ THE FIRST BRANCH RENDERS WHAT SHIPPED BEFORE AT N ≠ 1, LEADING SPACE
 * INCLUDED. An upload with no decorated rows is the common path, and splitting
 * this sentence had to leave it alone. `name-mismatch-confirm.test.tsx` asserts
 * the whole sentence — leading space and closing full stop included — so it
 * cannot drift into a differently-worded one without failing.
 *
 * ⚠️ AND NO CLAIM IS MADE HERE ABOUT THAT TEST PREDATING THE SPLIT, because it
 * does not. An earlier version of this comment said the assertion "survived the
 * split unedited — which is the evidence that only the sentence's shape moved",
 * and called it exact-string rather than substring. Both were false:
 * `git show HEAD:…/name-mismatch-confirm.test.tsx` contains no such assertion,
 * so the split WROTE it, and it is a `toContain`. It guards against future
 * drift; it is not evidence about the past.
 *
 * At N = 1 the branch now differs deliberately: `carry()` was applied here
 * afterwards, so a single row stopped being described with a plural verb.
 *
 * Returns null when every row mismatched — there is no remainder to describe.
 */
function remainderSentence(matched: number, decorated: number, clientName: string): string | null {
  if (matched === 0 && decorated === 0) return null;

  // "one carries …" / "N carry …" — the standard the surrounding prose already
  // keeps with `total === 1 ? "post carries" : "posts carry"` up in the summary
  // paragraph. A plural verb for a single row here would undercut that care.
  const carry = (n: number, what: string) =>
    n === 1 ? `one carries ${what}` : `${n} carry ${what}`;
  // ⚠️ NAMES THE STATE WITHOUT IMPLYING A FAULT. These posts are this client's,
  // they are filed correctly, and nobody has anything to fix — the scraper sent
  // LinkedIn's author block and ArcBase accounted for it. Any wording hinting at
  // a problem would send a reader looking for one that does not exist.
  const block = `${clientName}’s name inside LinkedIn’s author block`;

  if (decorated === 0) return ` The other ${carry(matched, "a matching author name")}.`;
  if (matched === 0) return ` The other ${carry(decorated, block)}.`;
  return ` Of the others, ${carry(matched, "a matching author name")} and ${carry(decorated, block)}.`;
}

/** ⚠️ THREE LABELS, BECAUSE THERE ARE THREE STATES — see `AuthorVerdict`. */
const VERDICT_LABEL: Record<ScrapedAuthor["verdict"], string> = {
  // ⚠️ NAMES THE AUTHOR, NOT AN OUTCOME. Every row here is filed under the
  // selected Client (ADR 0010); what differs is only whether the scrape agrees
  // about who wrote the post.
  match: "author matches",
  // ⚠️ NOT COLLAPSED INTO `match`, AND THAT IS DELIBERATE. This IS the Client —
  // "author differs" would be a lie — but it arrived wrapped in LinkedIn's
  // author block, and this screen is the one place the raw strings are visible.
  // Labelling it "author matches" would hide the scraper's behaviour precisely
  // where someone is already looking at it.
  artifact: "author matches + badge",
  mismatch: "author differs",
};

/**
 * One distinct scraped author.
 *
 * ⚠️ THE RESIDUE IS SHOWN NEXT TO THE RAW STRING, NEVER INSTEAD OF IT. The raw
 * value alone does not explain a refusal — a reader shown only
 * `Raj Singhania` against `Raj Singh` cannot see what the guard objected to.
 * Showing the leftover says exactly which characters could not be accounted for.
 *
 * ⚠️ THIS REPLACED A "matched as: <cleaned>" LINE THAT HAD GONE STALE. `cleaned`
 * was the scraped string minus one trailing " • You" — the value the OLD
 * predicate compared to the Client's name. Since 2026-08-20 the comparison runs
 * the other way (strip the Client's name and known chrome from the scrape, look
 * at what is left), so that line described a rule the code no longer applied.
 */
function AuthorRow({ author, clientName }: { author: ScrapedAuthor; clientName: string }) {
  const { postName, residue, count, verdict } = author;

  // ⚠️ TWO DIFFERENT REASONS A ROW CAN FAIL, AND THEY NEED DIFFERENT SENTENCES.
  // A residue means characters were left over after accounting. But a mismatch
  // can also have an EMPTY residue — "• You Premium • You" and "Verified" both
  // account for completely and fail because the Client's NAME was never
  // consumed. Keying the explanation on the residue alone left exactly those
  // rows with `author differs`, a raw string, and no stated reason at all.
  //
  // ⚠️ AND THE NOTHING-WAS-CONSUMED ROW LANDS HERE TOO. When the residue equals
  // the raw string, printing it would merely repeat the line above — but the
  // reason still needs saying, and "the name is absent" is what is true.
  const accounted = residue !== "" && residue !== postName.trim();
  const nameAbsent = verdict === "mismatch" && postName.trim() !== "" && !accounted;

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[12.5px] break-all">
          {postName === "" ? (
            <span className="text-muted-foreground italic">(no author name on these rows)</span>
          ) : (
            postName
          )}
        </div>
        {/* Only worth showing when the accounting actually removed something —
            otherwise the line just repeats the string directly above it. */}
        {accounted && (
          <div className="mt-0.5 font-mono text-[10.5px] break-all text-muted-foreground">
            couldn&rsquo;t account for: {residue}
          </div>
        )}
        {nameAbsent && (
          <div className="mt-0.5 font-mono text-[10.5px] break-all text-muted-foreground">
            {clientName} doesn&rsquo;t appear in this string
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono text-[11px] tabular-nums">
          {count} {count === 1 ? "post" : "posts"}
        </div>
        <div
          className={
            verdict === "mismatch"
              ? "mt-0.5 font-mono text-[10px] tracking-widest text-primary uppercase"
              : "mt-0.5 font-mono text-[10px] tracking-widest text-muted-foreground uppercase"
          }
        >
          {VERDICT_LABEL[verdict]}
        </div>
      </div>
    </div>
  );
}
