import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import type { ReportLinkOutreach } from "@/services/report-links";

import { OutreachSummary } from "./outreach-summary";

function outreach(
  over: Partial<Extract<ReportLinkOutreach, { status: "ok" }>> = {},
): ReportLinkOutreach {
  // The real observed snapshot, in proportion: 1,435 prospects, 1,230 sent,
  // 217 accepted, 39 replies, 8 meetings (spec, 2026-07-27).
  return {
    status: "ok",
    snapshotAt: "2026-07-27T09:00:00.000Z",
    totalProspects: 1435,
    sent: 1230,
    connected: 217,
    replied: 39,
    meetingsBooked: 8,
    email: { status: "not-in-export" },
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
    const { container } = render(<OutreachSummary outreach={{ status: "empty" }} />);
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

describe("OutreachSummary — F1: the UNREADABLE state, distinct from empty and from a zero", () => {
  // ⚠️ THE DEFECT THIS SLICE REPAIRS. Before F1, a malformed aggregate reached
  // this component as `null` — identical to "no outreach uploaded" — and told a
  // Client nothing was done for them when the truth was that the read failed.
  it("⚠️ renders a sentence saying the figures could not be read — NEVER the empty state's silence", () => {
    render(<OutreachSummary outreach={{ status: "unavailable" }} />);

    expect(screen.getByText(/could not be read/i)).toBeInTheDocument();
  });

  it("⚠️ renders NONE of the five LinkedIn figure blocks — not a zeroed row", () => {
    // The test that must fail if "unavailable" is ever collapsed back into a
    // same-shaped zeroed row: asserting the figures' ABSENCE, not merely that
    // a sentence exists somewhere, is what actually catches that regression.
    render(<OutreachSummary outreach={{ status: "unavailable" }} />);

    expect(screen.queryByTestId("outreach-prospects")).toBeNull();
    expect(screen.queryByTestId("outreach-requests-sent")).toBeNull();
    expect(screen.queryByTestId("outreach-connections-accepted")).toBeNull();
    expect(screen.queryByTestId("outreach-replies")).toBeNull();
    expect(screen.queryByTestId("outreach-meetings-booked")).toBeNull();
  });

  it("⚠️ does NOT say 'no outreach' / 'no snapshot' wording — that sentence is reserved for empty", () => {
    render(<OutreachSummary outreach={{ status: "unavailable" }} />);

    expect(screen.queryByText(/no outreach|no snapshot/i)).not.toBeInTheDocument();
  });

  it("⚠️ prints no '0' anywhere — absence of a reading is not a measurement", () => {
    const { container } = render(<OutreachSummary outreach={{ status: "unavailable" }} />);

    expect(spacedText(container)).not.toMatch(/\b0\b/);
  });

  it("does NOT render an empty block either — an unreadable read still says something", () => {
    const { container } = render(<OutreachSummary outreach={{ status: "unavailable" }} />);

    expect(container).not.toBeEmptyDOMElement();
  });

  it("carries no rate, percentage, score or rank in the unavailable copy", () => {
    const { container } = render(<OutreachSummary outreach={{ status: "unavailable" }} />);

    const text = spacedText(container);
    expect(text).not.toMatch(
      /\b(rate|percent|percentage|score|rank(ing|ed)?|benchmark|conversion|average|best|top|optimal|recommended?|momentum|improv\w*)\b/i,
    );
    expect(text).not.toMatch(/%/);
  });
});

describe("OutreachSummary — the Email channel (S4, D9)", () => {
  it("renders the three Email figures when the channel is present", () => {
    render(
      <OutreachSummary
        outreach={outreach({
          email: { status: "ok", sent: 645, replied: 39, meetingsBooked: 13, combinedMeetings: 19 },
        })}
      />,
    );

    for (const [label, value] of [
      ["Emails sent", "645"],
      ["Email replies", "39"],
      ["Email meetings booked", "13"],
    ] as const) {
      const block = screen.getByTestId(`outreach-${label.toLowerCase().replace(/ /g, "-")}`);
      expect(within(block).getByText(label)).toBeInTheDocument();
      expect(within(block).getByText(value)).toBeInTheDocument();
    }
  });

  it("⚠️ labels the combined-meetings figure as a count of PEOPLE, never a total or a sum", () => {
    render(
      <OutreachSummary
        outreach={outreach({
          email: { status: "ok", sent: 645, replied: 39, meetingsBooked: 13, combinedMeetings: 19 },
        })}
      />,
    );

    const text = spacedText(screen.getByTestId("outreach-combined-meetings"));
    expect(text).toMatch(/19/);
    expect(text).toMatch(/people|either|or both/i);
    expect(text.toLowerCase()).not.toMatch(/\btotal\b/);
  });

  it("⚠️ STATES ZERO for every Email figure — it never drops the row, exactly like the LinkedIn side", () => {
    render(
      <OutreachSummary
        outreach={outreach({
          email: { status: "ok", sent: 0, replied: 0, meetingsBooked: 0, combinedMeetings: 8 },
        })}
      />,
    );

    expect(within(screen.getByTestId("outreach-emails-sent")).getByText("0")).toBeInTheDocument();
    expect(within(screen.getByTestId("outreach-email-replies")).getByText("0")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("outreach-email-meetings-booked")).getByText("0"),
    ).toBeInTheDocument();
  });

  it("⚠️ renders 'not in this export' — NEVER a zeroed Email funnel — when the channel is absent", () => {
    // ⚠️ THE TEST THAT MUST FAIL IF SOMEONE 'SIMPLIFIES THE UNION AWAY'. A
    // future edit that collapsed `not-in-export` into a same-shaped zeroed
    // block would still render three figures; asserting their ABSENCE, not
    // merely the sentence's presence, is what actually catches it.
    render(<OutreachSummary outreach={outreach({ email: { status: "not-in-export" } })} />);

    expect(screen.getByText(/not in this export|did not carry/i)).toBeInTheDocument();
    expect(screen.queryByTestId("outreach-emails-sent")).toBeNull();
    expect(screen.queryByTestId("outreach-email-replies")).toBeNull();
    expect(screen.queryByTestId("outreach-email-meetings-booked")).toBeNull();
    expect(screen.queryByTestId("outreach-combined-meetings")).toBeNull();
  });

  it("prints no '0' anywhere in the not-in-export sentence — absence is not a measurement", () => {
    const { container } = render(
      <OutreachSummary outreach={outreach({ email: { status: "not-in-export" } })} />,
    );

    // The five LinkedIn figures still render (they are not zero in this
    // fixture), so this scopes to the Email section specifically.
    const emailSection = screen.getByText(/not in this export|did not carry/i).closest("div");
    expect(emailSection?.textContent ?? "").not.toMatch(/\b0\b/);
  });

  it("still shows the five LinkedIn figures when the Email channel is absent — the two sides are independent", () => {
    render(<OutreachSummary outreach={outreach({ email: { status: "not-in-export" } })} />);

    expect(screen.getByTestId("outreach-requests-sent")).toBeInTheDocument();
    expect(screen.getByTestId("outreach-meetings-booked")).toBeInTheDocument();
  });

  it("contains no rate, percentage, score, rank or benchmark in the Email section either", () => {
    const { container } = render(
      <OutreachSummary
        outreach={outreach({
          email: { status: "ok", sent: 645, replied: 39, meetingsBooked: 13, combinedMeetings: 19 },
        })}
      />,
    );

    const text = spacedText(container);
    expect(text).not.toMatch(
      /\b(rate|percent|percentage|score|rank(ing|ed)?|benchmark|conversion|average|best|top|optimal|recommended?|momentum|improv\w*)\b/i,
    );
    expect(text).not.toMatch(/%/);
  });

  it("shows no prospect string in the Email section — the address/mobile/message columns never map here", () => {
    const { container } = render(
      <OutreachSummary
        outreach={outreach({
          email: { status: "ok", sent: 645, replied: 39, meetingsBooked: 13, combinedMeetings: 19 },
        })}
      />,
    );
    // ⚠️ NOT A BEHAVIOURAL GUARANTEE — `ReportLinkEmailOutreach` structurally
    // has no field to hold a prospect string, so this documents the type-level
    // guard rather than testing a runtime filter that does not exist.
    expect(spacedText(container)).not.toMatch(/@|linkedin\.com/i);
  });

  it("⚠️ F1 — renders 'could not be read' for the Email block, NEVER the not-in-export sentence, NEVER a zero", () => {
    // ⚠️ THE SAME DEFECT AS THE TOP-LEVEL ONE, SMALLER BLAST RADIUS. "The
    // export carried the Email block and we could not read the numbers" is not
    // "the export did not carry the Email block" — before F1 both rendered the
    // identical not-in-export sentence.
    render(<OutreachSummary outreach={outreach({ email: { status: "unavailable" } })} />);

    expect(screen.getByText(/email.*could not be read/i)).toBeInTheDocument();
    expect(screen.queryByText(/did not carry the Email columns/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("outreach-emails-sent")).toBeNull();
    expect(screen.queryByTestId("outreach-email-replies")).toBeNull();
    expect(screen.queryByTestId("outreach-email-meetings-booked")).toBeNull();
    expect(screen.queryByTestId("outreach-combined-meetings")).toBeNull();
  });

  it("the Email 'could not be read' sentence prints no '0'", () => {
    const { container } = render(
      <OutreachSummary outreach={outreach({ email: { status: "unavailable" } })} />,
    );

    const emailSection = screen.getByText(/email.*could not be read/i).closest("div");
    expect(emailSection?.textContent ?? "").not.toMatch(/\b0\b/);
  });

  it("still shows the five LinkedIn figures when the Email block itself is unavailable", () => {
    render(<OutreachSummary outreach={outreach({ email: { status: "unavailable" } })} />);

    expect(screen.getByTestId("outreach-requests-sent")).toBeInTheDocument();
    expect(screen.getByTestId("outreach-meetings-booked")).toBeInTheDocument();
  });
});
