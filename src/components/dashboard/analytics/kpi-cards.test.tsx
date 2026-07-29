import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Kpi } from "@/services/types";

import { KpiCards } from "./kpi-cards";

const HERO: Kpi = { label: "Impressions", value: 1700, delta: 183, direction: "up" };

const KPIS: Kpi[] = [
  { label: "Posts", value: 3, delta: 200, direction: "up" },
  { label: "Likes", value: 150, delta: 12, direction: "down" },
];

/** The same figures with NO comparable prior period — all-time. */
const noPrior = (k: Kpi): Kpi => ({ ...k, delta: null, direction: null });

describe("KpiCards — with a prior period", () => {
  it("shows each delta with its direction glyph and a screen-reader word", () => {
    render(<KpiCards hero={HERO} kpis={KPIS} rangeLabel="30 days" />);

    expect(screen.getByText("183%")).toBeInTheDocument();
    // Hero + Posts rise, Likes falls: one chip per KPI, three in all.
    expect(screen.getAllByText("▲")).toHaveLength(2);
    expect(screen.getAllByText("▼")).toHaveLength(1);
    // Direction is never conveyed by colour alone.
    expect(screen.getAllByText(/^(Up|Down)$/)).toHaveLength(3);
  });

  it("names the period the comparison is against", () => {
    render(<KpiCards hero={HERO} kpis={KPIS} rangeLabel="30 days" />);
    expect(screen.getByText(/vs\. prior 30 days/)).toBeInTheDocument();
  });

  it("still shows a delta of zero — a real comparison that came out flat", () => {
    // ⚠️ THE DISCRIMINATOR. `delta: 0` means "measured, unchanged"; it must keep
    // rendering, or it would be indistinguishable from the absent case below.
    render(
      <KpiCards hero={{ ...HERO, delta: 0, direction: "up" }} kpis={[]} rangeLabel="30 days" />,
    );

    expect(screen.getByText("0%")).toBeInTheDocument();
  });
});

describe("KpiCards — ALL TIME, where no prior period exists", () => {
  it("renders NO CHIP AT ALL — not a zero, and not an em dash", () => {
    // ⚠️ THREE DIFFERENT FACTS, THREE DIFFERENT RENDERINGS. "0%" claims the
    // figure held steady against a period that does not exist; "—" is this
    // repo's reserved sign for "we tried to compute this and could not". The
    // only honest rendering of "there is nothing to compare with" is absence.
    const { container } = render(
      <KpiCards hero={noPrior(HERO)} kpis={KPIS.map(noPrior)} rangeLabel="all time" />,
    );

    expect(container.textContent ?? "").not.toMatch(/%/);
    expect(container.textContent ?? "").not.toMatch(/[▲▼]/);
    expect(container.textContent ?? "").not.toMatch(/—/);
    expect(screen.queryByText(/^(Up|Down)$/)).not.toBeInTheDocument();
  });

  it("DROPS the `vs. prior …` line rather than naming a period that is not there", () => {
    render(<KpiCards hero={noPrior(HERO)} kpis={KPIS.map(noPrior)} rangeLabel="all time" />);

    expect(screen.queryByText(/vs\. prior/)).not.toBeInTheDocument();
  });

  it("still shows every VALUE, which is perfectly real", () => {
    render(<KpiCards hero={noPrior(HERO)} kpis={KPIS.map(noPrior)} rangeLabel="all time" />);

    expect(screen.getByText("1,700")).toBeInTheDocument();
    expect(screen.getByText("150")).toBeInTheDocument();
    expect(screen.getByText("Impressions")).toBeInTheDocument();
  });

  it("hides the chip PER KPI, so a mixed set cannot leak one", () => {
    // Defensive: the service nulls them together, but a card must decide from
    // its OWN delta rather than from a range-wide flag it does not receive.
    render(<KpiCards hero={HERO} kpis={[KPIS[0]!, noPrior(KPIS[1]!)]} rangeLabel="30 days" />);

    expect(screen.getByText("200%")).toBeInTheDocument(); // Posts keeps its chip
    expect(screen.queryByText("12%")).not.toBeInTheDocument(); // Likes has none
  });
});
