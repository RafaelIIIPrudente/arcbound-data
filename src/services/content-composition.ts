import { median } from "@/lib/median";
import type { PostMetricsRow } from "@/services/analytics";
import type { ContentComposition, HashtagCount } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Content composition: WHAT a Client's content is made of, from each post's text.
// A pure function over the SAME rows `client-report.ts` already read — no new
// query — hung on `ClientReport`, exactly as `reconcileRates(rows)` and the
// posting-cadence slice are.
//
// ⚠️ COMPOSITIONAL ONLY, BY DESIGN. It reports what the content IS (hashtags,
// length, elements), never what it EARNED. There is deliberately no engagement
// figure, no ranking, no "top-performing" — on a five-to-ten-post history, "posts
// with a question earned more" is a coincidence dressed as advice, and this
// report reaches the Client. The same discipline the cross-client comparison
// (no ranks) and the cadence section (no score) already follow.
//
// ⚠️ FOUR STATES, KEPT APART. A post with NULL/empty text CANNOT be analysed: it
// is counted in `totalPosts`, omitted from every feature, and disclosed. A feature
// the Client genuinely did not use is a REAL ZERO (empty hashtag list, `0 of M`) —
// never the em dash, which the component reserves for "could not be analysed".
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LinkedIn's "see more" fold: a post longer than this is truncated in the feed.
 *
 * ⚠️ THE ONE INTENTIONAL LENGTH CONSTANT IN THIS SLICE, and it is a real platform
 * boundary — the point the feed collapses a post — NOT a tuning knob. There are
 * deliberately no short/medium/long buckets, because tertiles need invented
 * cutoffs; this branch bans those. If a second length cutoff seems necessary,
 * that is a design question to raise, not a constant to add.
 */
const SEE_MORE_FOLD = 1300;

// `#` then word characters — LinkedIn hashtags are alphanumeric/underscore.
const HASHTAG_RE = /#(\w+)/g;
// A URL IN THE TEXT. NOT `post_url` (every post has one); only an http(s) link
// the author actually wrote counts as "includes a link".
const URL_RE = /https?:\/\//i;
// An `@handle`: `@` at the start or after a NON-word character, then a word char.
// The non-word lead-in is what keeps an email ("name@host") from reading as a
// mention — there the `@` follows a word character.
const MENTION_RE = /(^|[^\w])@\w/;
// Any Unicode emoji. `Extended_Pictographic` covers the pictographic base of the
// vast majority of emoji without maintaining a hand-rolled codepoint list.
const EMOJI_RE = /\p{Extended_Pictographic}/u;

/** Analysable text, or null when the post carried none (null/blank `post_content`). */
function analysableText(row: PostMetricsRow): string | null {
  const text = row.post_content;
  return text != null && text.trim() !== "" ? text : null;
}

export function buildContentComposition(rows: PostMetricsRow[]): ContentComposition {
  const totalPosts = rows.length;

  const hashtagCounts = new Map<string, number>();
  const lengths: number[] = [];
  let analysedPosts = 0;
  let pastFold = 0;
  let withQuestion = 0;
  let withLink = 0;
  let withMention = 0;
  let withEmoji = 0;

  for (const row of rows) {
    const text = analysableText(row);
    if (text === null) continue; // counted in totalPosts, omitted from every feature

    analysedPosts += 1;
    lengths.push(text.length);
    if (text.length > SEE_MORE_FOLD) pastFold += 1;
    if (text.includes("?")) withQuestion += 1;
    if (URL_RE.test(text)) withLink += 1;
    if (MENTION_RE.test(text)) withMention += 1;
    if (EMOJI_RE.test(text)) withEmoji += 1;

    // CASE-FOLD for grouping (#SaaS and #saas are one tag), then count EVERY use.
    // "Usage count" is how often the tag appears, so a post using it twice counts
    // twice — the plain reading of "how often each was used".
    for (const match of text.matchAll(HASHTAG_RE)) {
      const tag = match[1]!.toLowerCase();
      hashtagCounts.set(tag, (hashtagCounts.get(tag) ?? 0) + 1);
    }
  }

  const hashtags: HashtagCount[] = [...hashtagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    // Most-used first; ties broken alphabetically so the order is deterministic.
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  return {
    totalPosts,
    analysedPosts,
    unanalysablePosts: totalPosts - analysedPosts,
    hashtags,
    // `null` for an empty set — there is no median of nothing, and a 0 would
    // invent a measurement. This is the "could not be analysed" state.
    medianLength: median(lengths),
    pastFold,
    withQuestion,
    withLink,
    withMention,
    withEmoji,
  };
}
