import { AnalyticsTruncated } from "@/components/dashboard/analytics/analytics-unavailable";
import { Wordmark } from "@/components/brand/wordmark";
import type { ReadTruncation, ReportFigure, ReportPeriod } from "@/services/types";

/**
 * The cover page of the exported report — the only part of the document that is
 * not a panel, and the only forced page break in it.
 *
 * Everything here is handed in. In particular the headline figures arrive as
 * `ReportFigure[]` straight from `getClientReport`: the cover does no arithmetic
 * of its own, so it cannot disagree with the panels behind it.
 *
 * ⚠️ THE ARRAY'S LENGTH IS THIS COMPONENT'S CONTRACT, NOT AN INCIDENTAL. It is
 * `keyPerformance.selected`, which is also the on-screen hero — four figures
 * today. The grid below is sized for that count, so a fifth (or a third) needs
 * this layout reconsidered against the fixed paper column, not just accepted.
 */

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * The reporting window written out for a reader outside the business.
 *
 * The on-screen picker's labels are terse because the picker supplies the
 * context; on a document that lands in an inbox with no context, a bare "2026"
 * or "Q3 2026" is ambiguous, so each kind says what it actually covers.
 */
export function periodInWords(period: ReportPeriod): string {
  switch (period.kind) {
    case "month":
      return `${MONTH_NAMES[period.month]} ${period.year}`;
    case "quarter": {
      const first = (period.quarter - 1) * 3;
      return `Q${period.quarter} ${period.year} · ${MONTH_NAMES[first]}–${MONTH_NAMES[first + 2]} ${period.year}`;
    }
    case "year":
      return `Calendar year ${period.year}`;
    case "custom": {
      // Spelled out in full, like every other kind here: this document lands in
      // an inbox with no picker beside it to supply the context. The days are
      // read off the STRINGS rather than through a Date — they are calendar
      // days, not instants, and a UTC+8 machine would shift them by one.
      const words = (day: string) => {
        const [y, m, d] = day.split("-") as [string, string, string];
        return `${Number(d)} ${MONTH_NAMES[Number(m) - 1]} ${y}`;
      };
      return period.startDay === period.endDay
        ? words(period.endDay)
        : `${words(period.startDay)} – ${words(period.endDay)}`;
    }
    case "all":
      return "All time · every post on record";
  }
}

/**
 * `now` is read in UTC so the rendered date is a pure function of its input —
 * the server renders in UTC, and a locale-dependent date would make this
 * component untestable for the sake of an hour's difference.
 */
function formatLongDate(date: Date): string {
  return `${date.getUTCDate()} ${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** The profile URL as a reader would write it — no scheme, no `www.`, no trailing slash. */
function displayUrl(url: string): string {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
}

function HeadlineFigure({ figure }: { figure: ReportFigure }) {
  const display =
    figure.value === null
      ? "—"
      : `${figure.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${figure.unit ?? ""}`;

  return (
    <div className="print-block">
      <div className="font-display text-4xl leading-none font-extrabold tracking-tight tabular-nums">
        {display}
      </div>
      <div className="mt-2 font-mono text-[10px] leading-relaxed tracking-[0.12em] text-muted-foreground uppercase">
        {figure.label}
        {figure.approximate ? <span className="ml-1 normal-case opacity-70">(approx.)</span> : null}
      </div>
    </div>
  );
}

export function ReportCover({
  clientName,
  linkedinUrl,
  period,
  figures,
  now,
  truncation,
}: {
  clientName: string;
  linkedinUrl: string;
  period: ReportPeriod;
  figures: ReportFigure[];
  now: Date;
  /**
   * Set when the post read behind this report hit the pager's cap. The cover's
   * headline figures are computed from that same partial read, so page 1 —
   * the first, often only, page a client reads — must carry the caveat too, not
   * leave a lower-bound standing as a total. Same component the body and screen
   * use, so the surfaces cannot word it differently.
   */
  truncation?: ReadTruncation | null;
}) {
  return (
    <header className="print-cover flex min-h-[220mm] flex-col justify-between">
      <div>
        <Wordmark className="text-2xl" />
        <div className="mt-1 font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase">
          by Arcbound
        </div>
      </div>

      <div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
          {/* Decoration, not content — and an em dash also MEANS "no value" in
              the figures below, so it must not be read as one. */}
          <span aria-hidden className="text-primary">
            —
          </span>
          LinkedIn performance report
        </div>
        <h1 className="mt-3 font-display text-5xl leading-[1.05] font-extrabold tracking-tight">
          {clientName}
        </h1>
        <p className="mt-3 font-mono text-xs text-muted-foreground">{displayUrl(linkedinUrl)}</p>
        <p className="mt-6 font-display text-lg font-semibold">{periodInWords(period)}</p>
      </div>

      {/* Figures and their caveat are ONE flex child, so the truncation note
          sits directly beneath the numbers it qualifies without unbalancing the
          cover's full-page `justify-between` layout. */}
      <div>
        {/* ⚠️ TWO COLUMNS, NOT FOUR. The paper column is FIXED at 700px
            (`--print-column`), so four across would leave about 163px a figure
            against 36px type — and impressions run one to two orders of
            magnitude wider than the figures beside them. A 2×2 gives each ~334px
            without touching the type scale. Compacting the number is forbidden:
            every figure on this document is exact. No test can see the overflow
            this prevents, so the printed sheet still wants one human look. */}
        <div className="grid grid-cols-2 gap-8 border-t pt-8">
          {figures.map((figure) => (
            <HeadlineFigure key={figure.label} figure={figure} />
          ))}
        </div>
        {truncation ? (
          <div className="mt-6">
            <AnalyticsTruncated read={truncation.read} total={truncation.total} />
          </div>
        ) : null}
      </div>

      <div className="border-t pt-4 font-mono text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
        Generated {formatLongDate(now)} · Arcbase · Arcbound
      </div>
    </header>
  );
}
