import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
