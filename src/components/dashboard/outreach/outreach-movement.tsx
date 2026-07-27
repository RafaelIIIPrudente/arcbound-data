import type { OutreachMovementState, OutreachMovementStep } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// WHAT MOVED BETWEEN THIS CLIENT'S TWO MOST RECENT SNAPSHOTS.
//
// ⚠️ A NEGATIVE DELTA IS NOT A REGRESSION, AND NOTHING IN THIS FILE MAY IMPLY IT
// IS. Snapshots are full re-uploads of a sheet somebody edits between exports:
// rows get removed, renamed, or re-scoped, and every one of those moves a count
// downward without anybody un-replying. From here the two causes are
// indistinguishable — so the panel states the change and both readings, and does
// not colour it, arrow it, rank it, or explain it. A test greps the rendered
// text for verdict words and the rendered classes for verdict colours, in BOTH
// directions: a rise painted green is the same claim as a drop painted red.
//
// ⚠️ FOUR WAYS THERE IS NOTHING TO COMPARE, AND A READER IS OWED WHICH. "we
// could not read the history", "there is only one snapshot", "the previous
// snapshot's rows would not load", and "a read came back partial" are four
// different facts. The one that matters most today is the second: almost every
// Client has exactly one snapshot, and rendering that as a row of zeros would
// assert that nothing changed — which is not what "nothing to compare with"
// means.
// ─────────────────────────────────────────────────────────────────────────────

/** Matches `follower-trend.tsx` / `upload-history.tsx`, unparseable-date guard included. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Signed, never absolute — a fall printed bare reads as a rise. */
function signed(n: number): string {
  return n.toLocaleString("en-US", { signDisplay: "exceptZero" });
}

const n = (v: number) => v.toLocaleString("en-US");

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-5">
      <div className="mb-4 font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
        Movement
      </div>
      {children}
    </section>
  );
}

/** One sentence, alone in its own element so a reader meets one fact at a time. */
function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-[12.5px] leading-relaxed text-muted-foreground">{children}</p>;
}

export function OutreachMovementPanel({ state }: { state: OutreachMovementState }) {
  // 1 — the HISTORY read broke. We do not know whether an earlier snapshot
  // exists, which is a different sentence from knowing there is only one.
  if (state.status === "history-unavailable") {
    return (
      <Shell>
        <Note>
          ArcBase could not read this client&rsquo;s upload history, so it cannot say whether an
          earlier snapshot exists to compare against. This usually clears once access is restored.
        </Note>
      </Shell>
    );
  }

  // 2 — THE COMMON CASE TODAY. The read worked; there is genuinely one snapshot.
  // Not an error, and never a zeroed panel.
  if (state.status === "single") {
    return (
      <Shell>
        <Note>Nothing to compare yet — this client has a single outreach snapshot.</Note>
        <Note>
          Upload the Master Database again and this panel will show what moved between the two.
        </Note>
      </Shell>
    );
  }

  // 3 — the header is known, the rows are not. The figures above still stand.
  if (state.status === "previous-unavailable") {
    return (
      <Shell>
        <Note>
          The previous snapshot ({formatDate(state.previousAt)}) could not be read, so there is
          nothing to compare against right now. Every figure above is from the current snapshot and
          is unaffected.
        </Note>
      </Shell>
    );
  }

  // 4 — a read came back short. ⚠️ THE SUBTLEST OF THE FOUR. A truncated snapshot
  // missing 435 rows would subtract as "−435 requests sent" — a fabricated
  // movement, indistinguishable on screen from a real one.
  if (state.status === "partial-read") {
    return (
      <Shell>
        <Note>
          One of the two snapshots was read only in part, so its counts are floors rather than
          totals. Subtracting a floor from a total would invent movement that never happened, so no
          comparison is shown.
        </Note>
      </Shell>
    );
  }

  const { movement, previousAt, currentAt } = state;

  return (
    <Shell>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-[10.5px] text-muted-foreground">
        <span>{formatDate(previousAt)}</span>
        <span aria-hidden>→</span>
        <span className="text-foreground">{formatDate(currentAt)}</span>
      </div>

      {/* The sheet's own size, first — it is the number that accounts for most
          of what follows, and reading it after the steps invites four separate
          explanations of one cause. */}
      <div
        data-testid="movement-prospects"
        className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-4"
      >
        <span className="font-mono text-[10.5px] tracking-[0.1em] text-muted-foreground uppercase">
          Prospects in the export
        </span>
        <span className="font-mono text-sm text-muted-foreground tabular-nums">
          {n(movement.prospects.previous)}
        </span>
        <span aria-hidden className="text-muted-foreground">
          →
        </span>
        <span className="font-display text-lg leading-none font-semibold tabular-nums">
          {n(movement.prospects.current)}
        </span>
        <span className="font-mono text-sm text-muted-foreground tabular-nums">
          {signed(movement.prospects.delta)}
        </span>
      </div>

      <ul className="space-y-3.5">
        {movement.steps.map((step) => (
          <Step key={step.label} step={step} />
        ))}
      </ul>

      <p className="mt-5 border-t pt-4 text-[11.5px] leading-relaxed text-muted-foreground">
        {/* ⚠️ THE SENTENCE THAT STOPS A READER CONCLUDING A CAUSE. Without it,
            every fall on this panel reads as the outreach going backwards. */}
        Every upload replaces the whole export, so a change here can come from the outreach itself
        or from the sheet — rows removed, renamed or re-scoped between exports move these counts
        too. ArcBase cannot tell which, and does not guess.
      </p>
    </Shell>
  );
}

/**
 * One step: its two counts and the difference between them.
 *
 * ⚠️ THE DELTA IS STYLED IDENTICALLY WHATEVER ITS SIGN. The sign is the whole
 * message; a hue, a glyph or a weight added to it would be ArcBase asserting
 * what the change MEANS, which is exactly the claim the panel refuses to make.
 */
function Step({ step }: { step: OutreachMovementStep }) {
  return (
    <li data-movement-step className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <span data-step-label className="min-w-44 font-mono text-[11px] tracking-[0.1em] uppercase">
        {step.label}
      </span>
      <span className="font-mono text-sm text-muted-foreground tabular-nums" data-step-previous>
        {n(step.previous)}
      </span>
      <span aria-hidden className="text-muted-foreground">
        →
      </span>
      <span
        className="font-display text-lg leading-none font-semibold tabular-nums"
        data-step-current
      >
        {n(step.current)}
      </span>
      <span className="font-mono text-sm text-muted-foreground tabular-nums" data-step-delta>
        {signed(step.delta)}
      </span>
      {/* The source column, exactly as the funnel above labels it — the two
          panels count the same thing and must be reconcilable at a glance. */}
      <span
        data-step-source
        className="basis-full font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {step.source}
      </span>
    </li>
  );
}
