import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConnectionStatusPill, IcpSegPill, ReplyStatusPill } from "./outreach-pill";

/** The pill element, identified by the tone attribute every pill carries. */
function pill(): HTMLElement {
  return screen.getByTestId("outreach-pill");
}

describe("ReplyStatusPill — the reference viewer's bug, refused", () => {
  // ⚠️ THIS SUITE EXISTS BECAUSE THE STANDALONE VIEWER GETS THIS WRONG.
  //
  // Its logic is:
  //   /Positive|Interested/.test(v) ? positive
  //     : /Negative|Not Interested/.test(v) ? negative
  //     : neutral
  //
  // "Not Interested" CONTAINS the substring "Interested", so the first branch
  // wins and the viewer paints a decline as a green positive reply — the second
  // branch is unreachable for it. "Replied - Interested" goes green the same
  // way. Those are precisely the two values S3 refused to classify, which makes
  // the viewer a live demonstration of why the refusal was right.
  //
  // Colour here comes from `canonicalReply`, never from a regex over raw text.
  it("renders 'Not Interested' UNCLASSIFIED — not positive, not negative", () => {
    render(<ReplyStatusPill value="Not Interested" />);

    expect(pill()).toHaveAttribute("data-tone", "unclassified");
    expect(pill()).not.toHaveAttribute("data-tone", "positive");
    expect(pill()).not.toHaveAttribute("data-tone", "negative");
  });

  it("renders 'Replied - Interested' UNCLASSIFIED for the same reason", () => {
    render(<ReplyStatusPill value="Replied - Interested" />);

    expect(pill()).toHaveAttribute("data-tone", "unclassified");
  });

  it("still renders the unclassified value — it is flagged, never hidden", () => {
    // Refusing to interpret a value is not refusing to show it. Hiding it would
    // be worse than mis-colouring it: nobody could find the rows to fix.
    render(<ReplyStatusPill value="Not Interested" />);

    expect(screen.getByText("Not Interested")).toBeInTheDocument();
  });

  it("does NOT colour by substring — 'Not Replied Yet' is not a reply", () => {
    render(<ReplyStatusPill value="Not Replied Yet" />);

    expect(pill()).toHaveAttribute("data-tone", "unclassified");
  });

  it("colours the values the source actually defines", () => {
    const cases: [string, string][] = [
      ["Replied - Positive", "positive"],
      ["Replied - Negative", "negative"],
      ["Replied - Neutral", "neutral"],
      ["No Reply", "quiet"],
      ["Replied", "neutral"],
    ];

    for (const [value, tone] of cases) {
      const { unmount } = render(<ReplyStatusPill value={value} />);
      expect(pill(), value).toHaveAttribute("data-tone", tone);
      unmount();
    }
  });
});

describe("ReplyStatusPill — the label is the RAW value (ADR 0009)", () => {
  it("shows a date-suffixed status exactly as stored", () => {
    // ⚠️ COLOUR IS GROUPING; THE LABEL IS THE VALUE. This row buckets as
    // replied-unspecified, but the cell must still say what the sheet says —
    // ArcBase does not rewrite the export to match its own vocabulary.
    render(<ReplyStatusPill value="Replied 2026-07-13" />);

    expect(screen.getByText("Replied 2026-07-13")).toBeInTheDocument();
    expect(pill()).toHaveAttribute("data-tone", "neutral");
  });

  it("does not trim, re-case, or normalise the text it displays", () => {
    render(<ReplyStatusPill value="  REPLIED - POSITIVE  " />);

    // The bucket forgives formatting; the label does not change.
    expect(pill()).toHaveAttribute("data-tone", "positive");
    expect(pill().textContent).toBe("  REPLIED - POSITIVE  ");
  });
});

describe("ConnectionStatusPill", () => {
  it("gives Connected and Pending DISTINCT treatments", () => {
    const { unmount } = render(<ConnectionStatusPill value="Connected" />);
    const connected = pill().getAttribute("data-tone");
    unmount();

    render(<ConnectionStatusPill value="Pending" />);
    const pending = pill().getAttribute("data-tone");

    expect(connected).toBeTruthy();
    expect(pending).toBeTruthy();
    expect(connected).not.toBe(pending);
  });

  it("falls back to the neutral treatment for anything else", () => {
    render(<ConnectionStatusPill value="Withdrawn" />);

    expect(pill()).toHaveAttribute("data-tone", "neutral");
    expect(screen.getByText("Withdrawn")).toBeInTheDocument();
  });

  it("forgives case and whitespace when choosing the treatment", () => {
    render(<ConnectionStatusPill value=" connected " />);

    expect(pill()).toHaveAttribute("data-tone", "connected");
  });
});

describe("IcpSegPill", () => {
  it("renders the raw segment", () => {
    render(<IcpSegPill value="Series B SaaS" />);

    expect(screen.getByText("Series B SaaS")).toBeInTheDocument();
  });

  it("uses ONE neutral treatment for every segment", () => {
    // ⚠️ NOT COLOUR-CODED PER SEGMENT, ON PURPOSE. ICP Seg is free-ish text with
    // no ranking and no fixed vocabulary; assigning a hue per value would invent
    // a categorisation the sheet does not contain, and a hashed palette would
    // make two unrelated segments look related. The pill is for shape, not for
    // claim.
    const { unmount } = render(<IcpSegPill value="Series B SaaS" />);
    const a = pill().getAttribute("data-tone");
    unmount();

    render(<IcpSegPill value="PE-backed services" />);
    expect(pill().getAttribute("data-tone")).toBe(a);
  });
});

describe("every pill — a null cell renders EMPTY", () => {
  // ⚠️ NEVER "0", "—", "null" OR "N/A". These are text columns straight from the
  // sheet; an invented placeholder is ArcBase asserting something the export did
  // not say.
  it.each([
    ["ConnectionStatusPill", ConnectionStatusPill],
    ["ReplyStatusPill", ReplyStatusPill],
    ["IcpSegPill", IcpSegPill],
  ])("%s renders nothing for null", (_name, Pill) => {
    const { container } = render(<Pill value={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ["ConnectionStatusPill", ConnectionStatusPill],
    ["ReplyStatusPill", ReplyStatusPill],
    ["IcpSegPill", IcpSegPill],
  ])("%s renders nothing for a whitespace-only cell", (_name, Pill) => {
    const { container } = render(<Pill value="   " />);

    expect(container).toBeEmptyDOMElement();
  });

  it("invents no placeholder glyph anywhere", () => {
    const { container } = render(<ReplyStatusPill value={null} />);

    expect(container.textContent).not.toMatch(/—|N\/A|null|^0$/);
  });
});
