import { Wordmark } from "@/components/brand/wordmark";
import type { ReportFigure, ReportPeriod } from "@/services/types";

/**
 * The cover page of the exported report — the only part of the document that is
 * not a panel, and the only forced page break in it.
 *
 * Everything here is handed in. In particular the three headline figures arrive
 * as `ReportFigure[]` straight from `getClientReport`: the cover does no
 * arithmetic of its own, so it cannot disagree with the panels behind it.
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
}: {
  clientName: string;
  linkedinUrl: string;
  period: ReportPeriod;
  figures: ReportFigure[];
  now: Date;
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

      <div className="grid grid-cols-3 gap-8 border-t pt-8">
        {figures.map((figure) => (
          <HeadlineFigure key={figure.label} figure={figure} />
        ))}
      </div>

      <div className="border-t pt-4 font-mono text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
        Generated {formatLongDate(now)} · Arcbase · Arcbound
      </div>
    </header>
  );
}
