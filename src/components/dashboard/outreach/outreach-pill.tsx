import { Badge } from "@/components/ui/badge";
import { canonicalReply } from "@/lib/outreach-vocab";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Status pills for the prospect table.
//
// ⚠️ COLOUR IS A GROUPING. THE LABEL IS THE VALUE. Every pill prints the raw
// stored text, byte for byte — a cell holding "Replied 2026-07-13" says that,
// even though it buckets as replied-unspecified. ArcBase does not rewrite what
// the sheet said (ADR 0009); it only decides what shade to draw behind it.
//
// ⚠️ THE REPLY COLOUR COMES FROM `canonicalReply`, NEVER FROM A REGEX OVER THE
// RAW STRING — and that is not a stylistic preference. The standalone viewer
// this table is modelled on colours replies with:
//
//     /Positive|Interested/.test(v) ? positive
//       : /Negative|Not Interested/.test(v) ? negative
//       : neutral
//
// "Not Interested" CONTAINS "Interested", so the first branch matches and a
// decline renders as a green POSITIVE reply; the negative branch is unreachable
// for it, and "Replied - Interested" goes green the same way. Those are exactly
// the two values S3 refused to classify, so the viewer is a working
// demonstration of why that refusal was right. Porting the regex would have
// silently reversed it — on three rows in 1,435, where nobody would ever look.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How a pill is shaded.
 *
 * ⚠️ `unclassified` IS NOT `neutral`. Neutral means "a value we understand that
 * carries no sentiment"; unclassified means "nobody has taught ArcBase what this
 * says". They must look different, because only the second is a row somebody
 * needs to go and resolve. The dashed border is doing that work.
 */
type Tone = "positive" | "negative" | "neutral" | "quiet" | "connected" | "unclassified";

const TONE_CLASS: Record<Tone, string> = {
  positive: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  negative: "border-destructive/30 bg-destructive/10 text-destructive",
  neutral: "border-border bg-muted text-foreground",
  // The commonest value in the column by a wide margin (1,396 of 1,435 rows), so
  // it is deliberately the quietest thing on the row — 1,396 loud pills would
  // drown every status that actually needs attention.
  quiet: "border-transparent bg-transparent text-muted-foreground",
  connected: "border-primary/30 bg-primary/10 text-primary",
  // Visibly unresolved: dashed, so it reads as "pending a human" rather than as
  // a category of its own.
  unclassified:
    "border-dashed border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

/**
 * The shared pill.
 *
 * ⚠️ RENDERS NOTHING FOR A BLANK CELL — never "—", "N/A", "null" or "0". These
 * are text columns straight from the sheet, and a placeholder would be ArcBase
 * asserting something the export did not say. An empty cell is the honest
 * rendering of an empty cell.
 */
function Pill({ value, tone }: { value: string | null; tone: Tone }) {
  if (value === null || value.trim() === "") return null;
  return (
    <Badge
      data-testid="outreach-pill"
      data-tone={tone}
      variant="outline"
      className={cn("max-w-full truncate font-mono text-[10.5px] font-normal", TONE_CLASS[tone])}
      title={value}
    >
      {value}
    </Badge>
  );
}

/** Case- and whitespace-insensitive comparison, for choosing a shade only. */
function is(value: string, expected: string): boolean {
  return value.trim().toLowerCase() === expected;
}

/**
 * Connection Status — a binary accepted/pending flag.
 *
 * The column holds exactly two values in the observed export (`Pending` 1,218,
 * `Connected` 217). Anything else is shown under the neutral shade rather than
 * forced into one of the two: a third value is news, not a mis-spelling to
 * absorb.
 */
export function ConnectionStatusPill({ value }: { value: string | null }) {
  const raw = value ?? "";
  const tone: Tone = is(raw, "connected") ? "connected" : is(raw, "pending") ? "quiet" : "neutral";
  return <Pill value={value} tone={tone} />;
}

/**
 * Reply Status — shaded by canonical bucket, labelled with the raw text.
 *
 * See the file header for why the bucket, and not a regex, decides the colour.
 */
export function ReplyStatusPill({ value }: { value: string | null }) {
  const bucket = canonicalReply(value);
  const tone: Tone =
    bucket === "positive"
      ? "positive"
      : bucket === "negative"
        ? "negative"
        : bucket === "no-reply"
          ? "quiet"
          : bucket === "unrecognised"
            ? "unclassified"
            : // `neutral` and `replied-unspecified` share a shade: both mean
              // "somebody answered and the sheet states no sentiment". They are
              // still distinguishable on screen, because the label is the raw
              // value and those two read differently.
              "neutral";
  return <Pill value={value} tone={tone} />;
}

/**
 * ICP Seg — one shade for every segment.
 *
 * ⚠️ DELIBERATELY NOT COLOUR-CODED PER VALUE. The column has no ranking and no
 * fixed vocabulary, so a hue per segment would invent a categorisation the sheet
 * does not contain, and a hashed palette would make two unrelated segments look
 * related. The pill gives the value a shape so the eye can find it in a
 * 24-column row; it makes no claim beyond that.
 */
export function IcpSegPill({ value }: { value: string | null }) {
  return <Pill value={value} tone="neutral" />;
}
