import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { OutreachFunnelStep } from "@/services/types";

import { OutreachFunnel } from "./outreach-funnel";

const FUNNEL: OutreachFunnelStep[] = [
  {
    label: "Requests sent",
    count: 1220,
    source: "Date Sent",
    rule: "a date is recorded in Date Sent",
  },
  {
    label: "Connections accepted",
    count: 217,
    source: "Connection Status",
    rule: "Connection Status reads Connected",
  },
  {
    label: "Replied",
    count: 39,
    source: "Reply Status",
    rule: "Reply Status is anything other than No Reply, and is not blank",
  },
  {
    label: "Meetings booked",
    count: 8,
    source: "Meeting Booked (date)",
    rule: "a date is recorded in Meeting Booked",
  },
];

/** The row containing a given step label. */
function row(label: string): HTMLElement {
  const node = screen.getByText(label).closest("[data-step]");
  if (!(node instanceof HTMLElement)) throw new Error(`no step row for ${label}`);
  return node;
}

describe("OutreachFunnel", () => {
  it("renders every step with its count", () => {
    render(<OutreachFunnel funnel={FUNNEL} />);

    expect(within(row("Requests sent")).getByText("1,220")).toBeInTheDocument();
    expect(within(row("Connections accepted")).getByText("217")).toBeInTheDocument();
    expect(within(row("Replied")).getByText("39")).toBeInTheDocument();
    expect(within(row("Meetings booked")).getByText("8")).toBeInTheDocument();
  });

  it("SHOWS THE SOURCE COLUMN beside every step", () => {
    // ⚠️ THE WHOLE REASON THIS PANEL EXISTS RATHER THAN FOUR BARE NUMBERS. Two of
    // these steps disagree with the Stage breakdown further down the page —
    // Stage-Replied is 25 while this Replied is 39 — because they answer
    // different questions. Naming the column is what stops a reader treating
    // that as a bug and "reconciling" it.
    render(<OutreachFunnel funnel={FUNNEL} />);

    for (const step of FUNNEL) {
      expect(within(row(step.label)).getByText(step.source)).toBeInTheDocument();
    }
  });

  it("SHOWS THE COUNTING RULE for every step, in plain words", () => {
    render(<OutreachFunnel funnel={FUNNEL} />);

    for (const step of FUNNEL) {
      expect(within(row(step.label)).getByText(step.rule)).toBeInTheDocument();
    }
  });

  it("names NO step's source as Stage", () => {
    render(<OutreachFunnel funnel={FUNNEL} />);

    for (const step of FUNNEL) {
      expect(within(row(step.label)).queryByText("Stage")).not.toBeInTheDocument();
    }
  });

  it("PRINTS NO PERCENTAGE, RATE OR RANK — anywhere", () => {
    // ⚠️ 8 of 1,220. A conversion rate computed from that reads as a verdict on a
    // Client that the sample cannot support (ADR 0012). This is a count panel,
    // and the regex is what stops it quietly becoming a scorecard.
    const { container } = render(<OutreachFunnel funnel={FUNNEL} />);
    const text = container.textContent ?? "";

    expect(text).not.toMatch(/%/);
    expect(text).not.toMatch(/\b(rate|conversion|score|rank|benchmark|per cent|percent)\b/i);
  });

  it("keeps the steps in the order given, never re-sorted", () => {
    render(<OutreachFunnel funnel={FUNNEL} />);

    const labels = screen.getAllByTestId("funnel-step-label").map((el) => el.textContent);
    expect(labels).toEqual(["Requests sent", "Connections accepted", "Replied", "Meetings booked"]);
  });

  it("renders a step whose count is 0 as 0, not as a gap", () => {
    // A measured zero is a fact. Hiding the step would make the funnel look like
    // it has three stages.
    render(
      <OutreachFunnel
        funnel={FUNNEL.map((s) => (s.label === "Meetings booked" ? { ...s, count: 0 } : s))}
      />,
    );

    expect(within(row("Meetings booked")).getByText("0")).toBeInTheDocument();
  });

  it("survives an all-zero funnel without dividing by zero", () => {
    // ⚠️ ASSERTED ON THE STYLE ATTRIBUTE, NOT ON textContent. The quotient is
    // only ever written to `style={{ width }}`, which is an ATTRIBUTE and never
    // part of textContent — so the original textContent assertion could not fail
    // and the guard it claimed to protect was untested. Worse, React silently
    // DROPS a style whose value is NaN, so the bar loses its width binding with
    // no NaN appearing anywhere in the markup either. The only honest check is
    // that every bar still carries a real width.
    const { container } = render(
      <OutreachFunnel funnel={FUNNEL.map((s) => ({ ...s, count: 0 }))} />,
    );

    const bars = [...container.querySelectorAll("[data-step] [style]")];
    expect(bars).toHaveLength(FUNNEL.length);
    for (const bar of bars) {
      expect(bar.getAttribute("style")).toMatch(/width:\s*0%/);
      expect(bar.getAttribute("style")).not.toMatch(/NaN|Infinity/);
    }
  });

  it("sizes each bar against the WIDEST step", () => {
    const { container } = render(<OutreachFunnel funnel={FUNNEL} />);
    const widths = [...container.querySelectorAll("[data-step] [style]")].map((el) =>
      el.getAttribute("style"),
    );

    // 1220 is the widest, so it is 100%; the rest are strictly narrower and none
    // is NaN.
    expect(widths[0]).toMatch(/width:\s*100%/);
    for (const style of widths) {
      expect(style).not.toMatch(/NaN|Infinity/);
    }
  });
});
