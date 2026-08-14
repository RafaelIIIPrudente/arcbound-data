import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

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

describe("KpiCards — the ⓘ that says what each figure measures", () => {
  // Radix drives Popover with Pointer Events jsdom does not implement.
  beforeAll(() => {
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  const ALL: Kpi[] = [
    { label: "Posts", value: 3, delta: 1, direction: "up" },
    { label: "Likes", value: 150, delta: 1, direction: "up" },
    { label: "Comments", value: 12, delta: 1, direction: "up" },
    { label: "Shares", value: 4, delta: 1, direction: "up" },
    { label: "Saves", value: 7, delta: 1, direction: "up" },
  ];

  it("gives the hero AND all five secondary KPIs one, each naming its own metric", () => {
    render(<KpiCards hero={HERO} kpis={ALL} rangeLabel="30 days" />);

    for (const label of ["Impressions", "Posts", "Likes", "Comments", "Shares", "Saves"]) {
      expect(screen.getByRole("button", { name: `What is ${label}?` }), label).toBeInTheDocument();
    }
  });

  it("defines the ▲/▼ chips on the line that says what they compare against", () => {
    render(<KpiCards hero={HERO} kpis={ALL} rangeLabel="30 days" />);

    expect(
      screen.getByRole("button", { name: "What is Change vs. prior period?" }),
    ).toBeInTheDocument();
  });

  it("opens the definition on click", async () => {
    const user = userEvent.setup();
    render(<KpiCards hero={HERO} kpis={ALL} rangeLabel="30 days" />);

    await user.click(screen.getByRole("button", { name: "What is Shares?" }));

    // The rename is the thing worth surfacing here: the data column is `reposts`.
    expect(await screen.findByText(/reposts/i)).toBeInTheDocument();
  });

  it("drops the delta ⓘ with the delta itself when there is no prior period", async () => {
    // ⚠️ Defining a comparison that is not on screen would reintroduce exactly
    // the claim the absent chip exists to avoid.
    render(<KpiCards hero={noPrior(HERO)} kpis={ALL.map(noPrior)} rangeLabel="all time" />);

    expect(
      screen.queryByRole("button", { name: "What is Change vs. prior period?" }),
    ).not.toBeInTheDocument();
    // …while the metric definitions themselves stay, because the FIGURES stay.
    expect(screen.getByRole("button", { name: "What is Impressions?" })).toBeInTheDocument();
  });

  it("renders NO ⓘ for a label nobody has defined — never an empty one", async () => {
    // ⚠️ The service cannot emit this today (`metric-definitions.test.ts` fails
    // if it ever does), but the render site must still fail safe rather than
    // draw a control that opens onto nothing.
    render(
      <KpiCards
        hero={HERO}
        kpis={[{ label: "Reach", value: 1, delta: 1, direction: "up" }]}
        rangeLabel="30 days"
      />,
    );

    expect(screen.getByText("Reach")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /What is Reach/ })).not.toBeInTheDocument();
  });

  it("keeps the 3×3 grid intact — the ⓘ must not add a row or orphan a card", () => {
    // ⚠️ kpi-cards.tsx documents the geometry: 4 hero cells + 5 KPIs = 9, which
    // tiles md:grid-cols-3 exactly, and stacks single-column on mobile. An ⓘ
    // that changed the column classes would orphan Saves onto a fourth row.
    const { container } = render(<KpiCards hero={HERO} kpis={ALL} rangeLabel="30 days" />);

    const grid = container.querySelector(".grid")!;
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).toContain("md:grid-cols-3");
    // The hero still spans 2×2 on desktop and one column on mobile.
    const heroCell = grid.firstElementChild!;
    expect(heroCell.className).toContain("col-span-1");
    expect(heroCell.className).toContain("md:col-span-2");
    expect(heroCell.className).toContain("md:row-span-2");
    // 1 hero + 5 cards = 6 grid children, unchanged by the triggers inside them.
    expect(grid.children).toHaveLength(6);
  });
});
