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
 * ⚠️ AND IT OFFERS NO "FIX IT FOR ME". Normalising the scraped value to force a
 * match would mean guessing which half of a mangled string is the real name,
 * which is how a post gets attributed to the WRONG client — and ADR 0009 forbids
 * rewriting scraped values regardless. The only lever here is human.
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
  const { clientName, authors, total, mismatched } = report;
  // Renamed from `willAppear`: every post appears now. What this counts is the
  // rows the scrape and the selection AGREE about.
  const matching = total - mismatched;

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
          {matching > 0 && ` The other ${matching} carry a matching author name.`}
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
              <AuthorRow key={author.postName} author={author} />
            ))}
          </div>
        </div>

        {/* ⚠️ POINTS AT THE ACTUAL OWNER. Without this the reader is told they
            have a problem and given nowhere to take it. */}
        <p className="mt-5 border-t pt-4 font-mono text-[10.5px] leading-relaxed text-muted-foreground/80">
          A name that repeats itself or carries a badge (&ldquo;Premium&rdquo;) is the scraper
          capturing the whole author block. That is fixed at the scrape, not here — ArcBase never
          rewrites a scraped value.
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
 * One distinct scraped author.
 *
 * ⚠️ `cleaned` IS SHOWN NEXT TO THE RAW STRING, NEVER INSTEAD OF IT. The join
 * strips one trailing " • You" before comparing, so a reader shown only the raw
 * value would reasonably conclude the trailing " • You" was the problem. Showing
 * both says: yes, that was stripped, and it still did not match.
 */
function AuthorRow({ author }: { author: ScrapedAuthor }) {
  const { postName, cleaned, count, matches } = author;

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
        {/* Only worth showing when the join's cleaning actually changed something. */}
        {cleaned !== postName && (
          <div className="mt-0.5 font-mono text-[10.5px] break-all text-muted-foreground">
            matched as: {cleaned === "" ? "(empty)" : cleaned}
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono text-[11px] tabular-nums">
          {count} {count === 1 ? "post" : "posts"}
        </div>
        <div
          className={
            matches
              ? "mt-0.5 font-mono text-[10px] tracking-widest text-muted-foreground uppercase"
              : "mt-0.5 font-mono text-[10px] tracking-widest text-primary uppercase"
          }
        >
          {/* ⚠️ NAMES THE AUTHOR, NOT AN OUTCOME. Both rows are filed under the
              selected Client (ADR 0010); the only thing that differs between
              them is whether the scrape agrees about who wrote the post. */}
          {matches ? "author matches" : "author differs"}
        </div>
      </div>
    </div>
  );
}
