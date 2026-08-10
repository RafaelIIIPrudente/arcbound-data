import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { EmailAnalytics } from "@/services/types";

import { EmailFunnelPanel } from "./email-funnel-panel";

const OK: Extract<EmailAnalytics, { status: "ok" }> = {
  status: "ok",
  funnel: [
    {
      label: "Emails sent",
      count: 645,
      source: "Email — Date Emailed",
      rule: "a value is recorded in Email — Date Emailed",
    },
    {
      label: "Replied",
      count: 39,
      source: "Email — Reply Status",
      rule: "Email — Reply Status is anything other than No reply, and is not blank",
    },
    {
      label: "Meetings booked",
      count: 13,
      source: "Email — Meeting Booked (date)",
      rule: "a date is recorded in Email — Meeting Booked (date)",
    },
  ],
  combinedMeetings: 19,
  sentWithoutAddress: 21,
  unrecognisedReplyValues: [],
  strippedQualifiers: [],
};

describe("EmailFunnelPanel — the three steps, each with its column and rule", () => {
  it("renders all three step labels, their source columns and their rules", () => {
    render(<EmailFunnelPanel emailAnalytics={OK} />);

    for (const step of OK.funnel) {
      expect(screen.getByText(step.label)).toBeInTheDocument();
      expect(screen.getByText(step.source)).toBeInTheDocument();
      expect(screen.getByText(step.rule)).toBeInTheDocument();
    }
  });

  it("labels the panel as the Email channel — visually separate from LinkedIn", () => {
    render(<EmailFunnelPanel emailAnalytics={OK} />);

    expect(screen.getByText("Email")).toBeInTheDocument();
  });

  it("⚠️ states the combined meetings figure as a UNION OF PEOPLE, never a sum", () => {
    render(<EmailFunnelPanel emailAnalytics={OK} />);

    // The exact D1 shape: 19 is the union of 6 LinkedIn-only + 5 email-only +
    // 8 both — never printed as a sum ("27") and never invites adding the
    // two funnels' Meetings booked steps.
    expect(screen.getByText(/19/)).toBeInTheDocument();
    const { container } = render(<EmailFunnelPanel emailAnalytics={OK} />);
    expect(container.textContent).toMatch(/union|either|or both|not a sum/i);
    expect(container.textContent).not.toMatch(/\btotal of\b/i);
  });

  it("carries no percentage, rate, score or rank", () => {
    const { container } = render(<EmailFunnelPanel emailAnalytics={OK} />);

    expect(container.textContent).not.toMatch(/%/);
    expect(container.textContent).not.toMatch(
      /\b(rate|conversion|score|rank|benchmark|percent)\b/i,
    );
  });
});

describe("EmailFunnelPanel — hasEmailChannel: false renders 'not in this export', NEVER a zeroed funnel", () => {
  const NOT_IN_EXPORT: EmailAnalytics = { status: "not-in-export" };

  it("⚠️ renders the disclosure sentence and NONE of the funnel's step labels", () => {
    // ⚠️ THE TEST THAT MUST FAIL IF SOMEONE 'SIMPLIFIES THE UNION AWAY'. A
    // future edit that collapses `not-in-export` into a same-shaped zeroed
    // funnel would still pass a naive "renders something" check; asserting
    // the ABSENCE of every step label is what actually catches it.
    render(<EmailFunnelPanel emailAnalytics={NOT_IN_EXPORT} />);

    expect(screen.getByText(/did not carry the Email columns/i)).toBeInTheDocument();
    expect(screen.queryByText("Emails sent")).toBeNull();
    expect(screen.queryByText("Replied")).toBeNull();
    expect(screen.queryByText("Meetings booked")).toBeNull();
  });

  it("⚠️ prints NO '0' figure anywhere — absence is not a measurement", () => {
    const { container } = render(<EmailFunnelPanel emailAnalytics={NOT_IN_EXPORT} />);

    expect(container.textContent).not.toMatch(/\b0\b/);
  });

  it("still labels the panel as Email, so the reader knows which channel is missing", () => {
    render(<EmailFunnelPanel emailAnalytics={NOT_IN_EXPORT} />);

    expect(screen.getByText("Email")).toBeInTheDocument();
  });
});
