import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { METRIC_DEFINITIONS } from "@/lib/metric-definitions";
import type { OutreachAnalytics } from "@/services/types";

import { OutreachKpis } from "./outreach-kpis";

const ANALYTICS: OutreachAnalytics = {
  totalProspects: 1435,
  funnel: [
    { label: "Requests sent", count: 1220, source: "Date Sent", rule: "a date is recorded" },
    {
      label: "Connections accepted",
      count: 217,
      source: "Connection Status",
      rule: "reads Connected",
    },
    { label: "Replied", count: 39, source: "Reply Status", rule: "not No Reply" },
    {
      label: "Meetings booked",
      count: 8,
      source: "Meeting Booked (date)",
      rule: "a date is recorded",
    },
  ],
  stage: [],
  connectionStatus: [],
  replyStatus: [],
  followUps: [],
  unreadableFollowUpCounts: 0,
  unrecognisedReplyValues: [],
  unrecognisedStageValues: [],
  strippedReplyQualifiers: [],
  sentOverTime: [],
  undatedSent: 0,
  unreadableSentValues: [],
  sentDateRange: null,
};

function card(label: string): HTMLElement {
  const node = screen.getByText(label).closest("[data-kpi]");
  if (!(node instanceof HTMLElement)) throw new Error(`no KPI card for ${label}`);
  return node;
}

describe("OutreachKpis", () => {
  it("leads with the total prospect count in this snapshot", () => {
    render(<OutreachKpis analytics={ANALYTICS} />);

    expect(within(card("Prospects")).getByText("1,435")).toBeInTheDocument();
  });

  it("shows every funnel figure", () => {
    render(<OutreachKpis analytics={ANALYTICS} />);

    expect(within(card("Requests sent")).getByText("1,220")).toBeInTheDocument();
    expect(within(card("Connections accepted")).getByText("217")).toBeInTheDocument();
    expect(within(card("Replied")).getByText("39")).toBeInTheDocument();
    expect(within(card("Meetings booked")).getByText("8")).toBeInTheDocument();
  });

  it("LABELS EACH FIGURE WITH THE COLUMN IT CAME FROM", () => {
    // ⚠️ Four figures from four different columns. Without the source on the
    // card, "Replied 39" and the Stage chart's "Replied 25" look like the same
    // measurement disagreeing with itself.
    render(<OutreachKpis analytics={ANALYTICS} />);

    expect(within(card("Requests sent")).getByText("Date Sent")).toBeInTheDocument();
    expect(within(card("Connections accepted")).getByText("Connection Status")).toBeInTheDocument();
    expect(within(card("Replied")).getByText("Reply Status")).toBeInTheDocument();
    expect(within(card("Meetings booked")).getByText("Meeting Booked (date)")).toBeInTheDocument();
  });

  it("names the source of the TOTAL as the snapshot itself, not a column", () => {
    render(<OutreachKpis analytics={ANALYTICS} />);

    expect(within(card("Prospects")).getByText(/snapshot/i)).toBeInTheDocument();
  });

  it("PRINTS NO PERCENTAGE, RATE OR SCORE", () => {
    const { container } = render(<OutreachKpis analytics={ANALYTICS} />);
    const text = container.textContent ?? "";

    expect(text).not.toMatch(/%/);
    expect(text).not.toMatch(/\b(rate|conversion|score|rank|benchmark|percent)\b/i);
  });

  it("renders a genuine zero as 0", () => {
    const zeroed = {
      ...ANALYTICS,
      funnel: ANALYTICS.funnel.map((s) => (s.label === "Meetings booked" ? { ...s, count: 0 } : s)),
    };
    render(<OutreachKpis analytics={zeroed} />);

    expect(within(card("Meetings booked")).getByText("0")).toBeInTheDocument();
  });
});

describe("OutreachKpis — the ⓘ on each headline number", () => {
  // Radix's Popover needs the Pointer Events jsdom does not implement.
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

  it("gives the snapshot total and all four funnel steps one", () => {
    render(<OutreachKpis analytics={ANALYTICS} />);

    for (const name of [
      "Prospects",
      "Requests sent",
      "Connections accepted",
      "Replied",
      "Meetings booked",
    ]) {
      expect(screen.getByRole("button", { name: `What is ${name}?` }), name).toBeInTheDocument();
    }
  });

  it("builds a step's definition from the step's OWN rule and column", async () => {
    // ⚠️ NOT FROM A SECOND COPY IN `metric-definitions.ts`. The rule text is
    // computed by `buildOutreachAnalytics` and already printed by the Pipeline
    // panel; restating it in a definitions record would be the same sentence in
    // two places. Driving it from the step is what makes drift impossible —
    // which this test proves by feeding a rule no record could know.
    const user = userEvent.setup();
    render(
      <OutreachKpis
        analytics={{
          ...ANALYTICS,
          funnel: [
            {
              label: "Requests sent",
              count: 1220,
              source: "Some Renamed Column",
              rule: "a completely made-up rule holds",
            },
          ],
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "What is Requests sent?" }));

    expect(
      await screen.findByText(/a completely made-up rule holds.*Some Renamed Column/),
    ).toBeInTheDocument();
  });

  it("explains the Stage gap, which is the thing that reads as a bug", async () => {
    // ⚠️ THE REASON THIS ROW NEEDED AN ⓘ AT ALL. It shows each step's SOURCE but
    // not its RULE, so "Replied 39" here beside "Replied 25" in the Stage chart
    // looks like a defect somebody would helpfully "fix".
    const user = userEvent.setup();
    render(<OutreachKpis analytics={ANALYTICS} />);

    await user.click(screen.getByRole("button", { name: "What is Replied?" }));

    expect(await screen.findByText(/FURTHEST point each prospect reached/)).toBeInTheDocument();
    expect(screen.getByText(/not meant to reconcile/)).toBeInTheDocument();
  });

  it("defines Prospects as the snapshot's own size, with the immutability caveat", async () => {
    const user = userEvent.setup();
    render(<OutreachKpis analytics={ANALYTICS} />);

    await user.click(screen.getByRole("button", { name: "What is Prospects?" }));

    expect(
      await screen.findByText(METRIC_DEFINITIONS.outreachProspects.definition),
    ).toBeInTheDocument();
    // The re-upload blind spot: a prospect deleted from the source sheet is
    // still counted in an older snapshot, which is what "immutable" costs.
    expect(METRIC_DEFINITIONS.outreachProspects.definition).toMatch(
      /deleted from the source sheet/,
    );
  });

  it("adds no ⓘ to a funnel step's SOURCE caption — one trigger per card", () => {
    render(<OutreachKpis analytics={ANALYTICS} />);

    expect(screen.getAllByRole("button", { name: /^What is / })).toHaveLength(5);
  });
});
