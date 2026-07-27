import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { OutreachAnalytics } from "@/services/types";

import { OutreachDisclosure } from "./outreach-disclosure";

const CLEAN: OutreachAnalytics = {
  totalProspects: 1435,
  funnel: [],
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

const analytics = (over: Partial<OutreachAnalytics>): OutreachAnalytics => ({ ...CLEAN, ...over });

describe("OutreachDisclosure — unrecognised values appear VERBATIM", () => {
  // ⚠️ THE PAGE'S CONSCIENCE. Every value ArcBase could not interpret is printed
  // here exactly as somebody typed it. Nothing is summarised into "other",
  // nothing is counted and discarded — because the only person who can say what
  // "Replied - Interested" means is a human reading the original words.
  it("prints an unrecognised REPLY value character for character", () => {
    render(
      <OutreachDisclosure analytics={analytics({ unrecognisedReplyValues: ["Not Interested"] })} />,
    );

    expect(screen.getByText("Not Interested")).toBeInTheDocument();
  });

  it("prints EVERY unrecognised reply value, not just the first", () => {
    render(
      <OutreachDisclosure
        analytics={analytics({
          unrecognisedReplyValues: ["Replied - Interested", "Not Interested"],
        })}
      />,
    );

    expect(screen.getByText("Replied - Interested")).toBeInTheDocument();
    expect(screen.getByText("Not Interested")).toBeInTheDocument();
  });

  it("prints unrecognised STAGE values too, kept apart from the reply ones", () => {
    render(
      <OutreachDisclosure
        analytics={analytics({
          unrecognisedReplyValues: ["Ghosted"],
          unrecognisedStageValues: ["Nurturing"],
        })}
      />,
    );

    expect(screen.getByText("Ghosted")).toBeInTheDocument();
    expect(screen.getByText("Nurturing")).toBeInTheDocument();
    expect(screen.getByText(/reply status/i)).toBeInTheDocument();
    expect(screen.getByText(/stage/i)).toBeInTheDocument();
  });

  it("never rewrites a value into an 'other' bucket", () => {
    const { container } = render(
      <OutreachDisclosure analytics={analytics({ unrecognisedStageValues: ["Warm Lead"] })} />,
    );

    expect(container.textContent).toContain("Warm Lead");
    expect(container.textContent?.toLowerCase()).not.toContain("other");
  });
});

describe("OutreachDisclosure — counted-but-excluded rows", () => {
  it("states how many rows have NO Date Sent", () => {
    render(<OutreachDisclosure analytics={analytics({ undatedSent: 215 })} />);

    expect(screen.getByText(/215/)).toBeInTheDocument();
  });

  it("keeps UNREADABLE dates apart from MISSING ones, and shows the text", () => {
    // Two different facts: nobody recorded a date, versus somebody recorded
    // something that is not one. One is routine; the other is a sheet to fix.
    render(
      <OutreachDisclosure
        analytics={analytics({ undatedSent: 215, unreadableSentValues: ["last tuesday"] })}
      />,
    );

    expect(screen.getByText("last tuesday")).toBeInTheDocument();
    expect(screen.getByText(/215/)).toBeInTheDocument();
  });

  it("states how many follow-up counts could not be read", () => {
    render(<OutreachDisclosure analytics={analytics({ unreadableFollowUpCounts: 12 })} />);

    expect(screen.getByText(/12/)).toBeInTheDocument();
  });

  it("PUBLISHES THE DATE-SENT RANGE, which is how the 2020 outlier surfaces", () => {
    // ⚠️ THE OUTLIER IS NOT FILTERED — it is named. One row sits at 2020-12-04
    // against an otherwise-2026 range, and any cutoff that removed it would be a
    // judgement the data does not support. Printing the range puts the odd date
    // in front of a reader on their first visit.
    render(
      <OutreachDisclosure
        analytics={analytics({ sentDateRange: { earliest: "2020-12-04", latest: "2026-07-23" } })}
      />,
    );

    expect(screen.getByText(/2020-12-04/)).toBeInTheDocument();
    expect(screen.getByText(/2026-07-23/)).toBeInTheDocument();
  });
});

describe("OutreachDisclosure — silence when there is nothing to disclose", () => {
  it("renders NOTHING when every value was understood and nothing was excluded", () => {
    // ⚠️ A PANEL THAT ALWAYS APPEARS IS A PANEL NOBODY READS. On a clean
    // snapshot there is no caveat to make, and inventing one would train the
    // reader to skip the block on the day it matters.
    const { container } = render(<OutreachDisclosure analytics={CLEAN} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("appears as soon as ONE thing needs saying", () => {
    const { container } = render(
      <OutreachDisclosure analytics={analytics({ unrecognisedStageValues: ["Nurturing"] })} />,
    );

    expect(container).not.toBeEmptyDOMElement();
  });
});
