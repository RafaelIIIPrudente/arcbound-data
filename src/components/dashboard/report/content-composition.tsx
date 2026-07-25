import type { ContentComposition, HashtagCount } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Content composition: what the Client's content is MADE OF — hashtags, length,
// and how often a post asks a question / links / mentions / uses emoji.
//
// ⚠️ COMPOSITIONAL ONLY. Every figure is a plain frequency. There is no
// engagement number, no ranking, no "top-performing"/"best"/"drives" — this
// document is client-facing and, on a handful of posts, a feature-to-engagement
// claim is a coincidence dressed as advice. The gaps between these facts are for
// the reader to interpret, not for the report to editorialise.
//
// ⚠️ FOUR STATES, KEPT APART. A feature the Client genuinely did not use is a REAL
// ZERO ("No hashtags used", "0 of M") — a fact. The em dash is reserved for "could
// not be analysed", which is only when NO post carried text (`analysedPosts === 0`);
// the component reads that field to tell the two apart. Print-safe: pure text and
// flex, `print-block` so the section is never split across the fold.
// ─────────────────────────────────────────────────────────────────────────────

// How many hashtags to list before collapsing the rest into "+ N more". A DISPLAY
// cap (presentation), not an analytical threshold — every hashtag is still counted
// in the service; this only bounds what a client-facing line shows at once.
const HASHTAG_DISPLAY_LIMIT = 8;

/** The em dash + a spoken reason. Reserved for "could not be analysed", never a zero. */
function NotAnalysed() {
  return (
    <>
      <span aria-hidden>—</span>
      <span className="sr-only">Could not be analysed — no post carried text</span>
    </>
  );
}

/** "N of M" — the count in the figure's scale, the base quiet beside it. */
function Count({ n, of }: { n: number; of: number }) {
  return (
    <>
      {n.toLocaleString()}
      <span className="ml-1.5 font-mono text-xs font-normal text-muted-foreground">
        of {of.toLocaleString()}
      </span>
    </>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-36 flex-1 rounded-lg border bg-card px-5 py-4">
      <div className="font-display text-2xl leading-none font-semibold tracking-tight tabular-nums">
        {children}
      </div>
      <div className="mt-2 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </div>
    </div>
  );
}

function Hashtags({
  hashtags,
  analysedPosts,
}: {
  hashtags: HashtagCount[];
  analysedPosts: number;
}) {
  // Nothing could be read → we do not KNOW whether they use hashtags.
  if (analysedPosts === 0) return <NotAnalysed />;
  // Read, and none used → a fact, stated plainly. NEVER an em dash.
  if (hashtags.length === 0) return <span className="text-muted-foreground">No hashtags used</span>;

  const shown = hashtags.slice(0, HASHTAG_DISPLAY_LIMIT);
  const more = hashtags.length - shown.length;
  return (
    <div className="flex flex-wrap items-baseline gap-y-1 text-sm">
      {shown.map((h, i) => (
        <span key={h.tag} className="whitespace-nowrap">
          {i > 0 ? (
            <span aria-hidden className="mx-2 text-muted-foreground/50">
              ·
            </span>
          ) : null}
          {`#${h.tag} (${h.count.toLocaleString()})`}
        </span>
      ))}
      {more > 0 ? (
        <span aria-hidden className="mx-2 text-muted-foreground/50">
          ·
        </span>
      ) : null}
      {more > 0 ? (
        <span className="whitespace-nowrap text-muted-foreground">
          + {more.toLocaleString()} more
        </span>
      ) : null}
    </div>
  );
}

/** Plain-language disclosure of posts with no text on record — counted, not analysed. */
function textlessDisclosure(unanalysable: number, total: number): string {
  const verb = unanalysable === 1 ? "has" : "have";
  const tail = unanalysable === 1 ? "isn’t" : "aren’t";
  return `${unanalysable.toLocaleString()} of ${total.toLocaleString()} posts ${verb} no post text on record and ${tail} analysed here.`;
}

export function ContentComposition({ composition }: { composition: ContentComposition }) {
  const {
    totalPosts,
    analysedPosts,
    unanalysablePosts,
    hashtags,
    medianLength,
    pastFold,
    withQuestion,
    withLink,
    withMention,
    withEmoji,
  } = composition;

  // 0 POSTS → NO BODY. The report's own no-data state handles an empty client; a
  // composition panel full of em dashes would add nothing.
  if (totalPosts === 0) return null;

  const element = (n: number) =>
    analysedPosts === 0 ? <NotAnalysed /> : <Count n={n} of={analysedPosts} />;

  return (
    <div className="print-block space-y-6 rounded-lg border bg-card p-5">
      <div className="space-y-2">
        <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
          Top hashtags
        </div>
        <Hashtags hashtags={hashtags} analysedPosts={analysedPosts} />
      </div>

      <div className="flex flex-wrap gap-3.5">
        <Figure label="Median length">
          {medianLength === null ? (
            <NotAnalysed />
          ) : (
            <>
              {medianLength.toLocaleString()}
              <span className="ml-1.5 font-mono text-xs font-normal text-muted-foreground">
                chars
              </span>
            </>
          )}
        </Figure>
        <Figure label="Asks a question">{element(withQuestion)}</Figure>
        <Figure label="Includes a link">{element(withLink)}</Figure>
        <Figure label="Mentions someone">{element(withMention)}</Figure>
        <Figure label="Uses emoji">{element(withEmoji)}</Figure>
      </div>

      {/* The see-more fold — the one real platform boundary. Omitted when there is
          nothing to measure it over, rather than claiming "0 of 0". */}
      {analysedPosts > 0 ? (
        <p className="max-w-2xl text-xs text-muted-foreground">
          {pastFold.toLocaleString()} of {analysedPosts.toLocaleString()} posts run past the
          &ldquo;see more&rdquo; fold (LinkedIn truncates a post beyond 1,300 characters).
        </p>
      ) : null}

      {unanalysablePosts > 0 ? (
        <p className="max-w-2xl text-xs text-muted-foreground">
          {textlessDisclosure(unanalysablePosts, totalPosts)}
        </p>
      ) : null}
    </div>
  );
}
