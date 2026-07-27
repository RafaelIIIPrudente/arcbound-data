import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import type { ReportLinkOutreach } from "@/services/report-links";

import { OutreachSummary } from "./outreach-summary";

function outreach(over: Partial<ReportLinkOutreach> = {}): ReportLinkOutreach {
  // The real observed snapshot, in proportion: 1,435 prospects, 1,230 sent,
  // 217 accepted, 39 replies, 8 meetings (spec, 2026-07-27).
  return {
    snapshotAt: "2026-07-27T09:00:00.000Z",
    totalProspects: 1435,
    sent: 1230,
    connected: 217,
    replied: 39,
    meetingsBooked: 8,
    ...over,
  };
}

/**
 * Text with the element boundaries preserved as spaces.
 *
 * Adjacent elements glue together in `textContent` ("39Meetings"), which both
 * breaks `\b`-anchored greps and can manufacture a digit-percent pair that was
 * never on screen. Joining the text NODES keeps every guard below honest.
 */
function spacedText(el: HTMLElement): string {
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  while (walker.nextNode()) parts.push(walker.currentNode.textContent ?? "");
  return parts.join(" ");
}

describe("OutreachSummary — aggregate counts only", () => {
  it("states the five figures, each under a plain label", () => {
    render(<OutreachSummary outreach={outreach()} />);

    for (const [label, value] of [
      ["Prospects", "1,435"],
      ["Requests sent", "1,230"],
      ["Connections accepted", "217"],
      ["Replies", "39"],
      ["Meetings booked", "8"],
    ] as const) {
      const block = screen.getByTestId(`outreach-${label.toLowerCase().replace(/ /g, "-")}`);
      expect(within(block).getByText(label)).toBeInTheDocument();
      expect(within(block).getByText(value)).toBeInTheDocument();
    }
  });

  it("says as at which snapshot date, so the figures are dated rather than timeless", () => {
    render(<OutreachSummary outreach={outreach()} />);
    expect(screen.getByText(/as at 27 Jul 2026/i)).toBeInTheDocument();
  });

  it("⚠️ STATES ZERO MEETINGS BOOKED — it never drops the row", () => {
    // Most Clients show 0 here (8 of 1,435 on the reference export). Omitting the
    // row when it is zero would make the report flatter BY SELECTION: a reader
    // could not tell "no meetings" from "we do not report meetings", and every
    // Client who did have one would be silently marked out.
    render(<OutreachSummary outreach={outreach({ meetingsBooked: 0 })} />);

    const block = screen.getByTestId("outreach-meetings-booked");
    expect(within(block).getByText("Meetings booked")).toBeInTheDocument();
    expect(within(block).getByText("0")).toBeInTheDocument();
  });

  it("renders NOTHING at all when the Client has no snapshot — no heading, no empty card", () => {
    // "This Client has no outreach uploaded" and "this Client's outreach shows
    // zero" are different sentences, and only one of them is ever true.
    const { container } = render(<OutreachSummary outreach={null} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/outreach/i)).not.toBeInTheDocument();
  });

  it("contains NO rate, percentage, score, rank or benchmark (grep guard)", () => {
    // 8 meetings from 1,230 requests is a fact. "A 0.6% conversion rate" and
    // "still building momentum" are both verdicts this page has no standing to
    // issue — and at this sample size, neither is even supportable.
    for (const fixture of [
      outreach(),
      outreach({ meetingsBooked: 0, replied: 0 }),
      outreach({ totalProspects: 1, sent: 1, connected: 0, replied: 0, meetingsBooked: 0 }),
    ]) {
      const { container, unmount } = render(<OutreachSummary outreach={fixture} />);
      const text = spacedText(container);
      expect(text).not.toMatch(
        /\b(rate|percent|percentage|score|rank(ing|ed)?|benchmark|conversion|average|best|top|optimal|recommended?|momentum|improv\w*)\b/i,
      );
      expect(text).not.toMatch(/%/);
      unmount();
    }
  });

  it("shows no prospect name, company, URL or stage — the block is counts and a date", () => {
    const { container } = render(<OutreachSummary outreach={outreach()} />);
    const text = spacedText(container);
    expect(text).not.toMatch(/linkedin\.com|https?:\/\//i);
    // Every visible token is a label, a formatted number, or the dated caption.
    expect(text).not.toMatch(/\b(Requested|In Conversation|Closed|Passed|Qualified)\b/);
  });
});
