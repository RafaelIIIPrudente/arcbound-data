import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { OutreachProspect } from "@/services/types";

import { prospectColumns, type ProspectColumnMeta } from "./prospect-columns";

function prospect(over: Partial<OutreachProspect> = {}): OutreachProspect {
  return {
    id: "1",
    outreachUploadId: "up1",
    clientId: "c1",
    rowIndex: 0,
    fullName: "Dana Reyes",
    title: "VP Engineering",
    company: "Northwind",
    icpSeg: "Series B SaaS",
    whyTheyFit: "hiring 12 engineers",
    whatTheyLack: "employer brand",
    whatArcboundOffers: "Tier 2 - founder-led content",
    matchingClientArchetype: "Founder / CEO / investor",
    linkedinUrl: "https://www.linkedin.com/in/dana-reyes",
    location: "Austin, TX",
    sourceCitation: "TechCrunch 2026-05-02",
    rationale: "scaling fast, no exec presence",
    linkedinMessage: "Hi Dana — noticed you are hiring",
    connectionStatus: "Pending",
    dateSent: "2026-07-20",
    replyStatus: "No Reply",
    followUpCount: "0",
    lastFollowUpDate: null,
    nextTouchDate: null,
    meetingBookedDate: null,
    stage: "Requested",
    owner: "Bryan",
    notes: "dana@northwind.io",
    qualifiedIcp: "Yes",
    emailBestEmail: null,
    emailMobile: null,
    emailSubjectLine: null,
    emailMessage: null,
    emailStatus: null,
    emailDateEmailed: null,
    emailReplyStatus: null,
    emailFollowUpCount: null,
    emailLastFollowUpDate: null,
    emailNextTouchDate: null,
    emailWebinarRegistered: null,
    emailMeetingBookedDate: null,
    emailStage: null,
    emailOwner: null,
    emailNotes: null,
    ...over,
  };
}

const meta = (id: string): ProspectColumnMeta => {
  const column = prospectColumns.find((c) => c.id === id);
  if (!column) throw new Error(`no column ${id}`);
  return column.meta as ProspectColumnMeta;
};

/** Render one column's cell for one row, without standing up a whole table. */
function cell(id: string, row: OutreachProspect) {
  const column = prospectColumns.find((c) => c.id === id);
  if (!column) throw new Error(`no column ${id}`);
  const renderer = column.cell as (ctx: { row: { original: OutreachProspect } }) => ReactNode;
  return render(<>{renderer({ row: { original: row } })}</>);
}

/** The 24 source columns, in the order the export writes them. */
const SOURCE_ORDER = [
  ["fullName", "Full Name", "Full Name"],
  ["title", "Title", "Title"],
  ["company", "Company", "Company"],
  ["icpSeg", "ICP Seg", "ICP Seg"],
  ["whyTheyFit", "Why They Fit", "Why They Fit (signal)"],
  ["whatTheyLack", "What They Lack", "What They Lack"],
  ["whatArcboundOffers", "What Arcbound Offers", "What Arcbound Offers (tier + hook)"],
  ["matchingClientArchetype", "Matching Client Archetype", "Matching Client Archetype"],
  ["linkedinUrl", "LinkedIn URL", "LinkedIn URL"],
  ["location", "Location", "Location"],
  ["sourceCitation", "Source / Citation", "Source / Citation"],
  ["rationale", "Rationale", "Rationale (1-line)"],
  ["linkedinMessage", "LinkedIn Message", "LinkedIn Message"],
  ["connectionStatus", "Connection Status", "Connection Status"],
  ["dateSent", "Date Sent", "Date Sent"],
  ["replyStatus", "Reply Status", "Reply Status"],
  ["followUpCount", "Follow-up Count", "Follow-up Count"],
  ["lastFollowUpDate", "Last Follow-up Date", "Last Follow-up Date"],
  ["nextTouchDate", "Next Touch Date", "Next Touch Date"],
  ["meetingBookedDate", "Meeting Booked", "Meeting Booked (date)"],
  ["stage", "Stage", "Stage"],
  ["owner", "Owner", "Owner"],
  ["notes", "Notes", "Notes"],
  ["qualifiedIcp", "Qualified (ICP)", "Qualified (ICP)"],
] as const;

describe("prospectColumns — all 24, in SOURCE ORDER", () => {
  it("defines exactly the 24 source columns and nothing else", () => {
    // ⚠️ NO id, outreachUploadId, clientId OR rowIndex. Those are ArcBase's own
    // bookkeeping, not the sheet's; showing them would put database identifiers
    // in a table staff read against a spreadsheet.
    expect(prospectColumns.map((c) => c.id)).toEqual(SOURCE_ORDER.map(([id]) => id));
    expect(prospectColumns).toHaveLength(24);
  });

  it("labels every header with the name staff see in the spreadsheet", () => {
    expect(prospectColumns.map((c) => c.header)).toEqual(SOURCE_ORDER.map(([, label]) => label));
  });

  it("carries the EXACT source header for every column, for hover-matching", () => {
    // ⚠️ THE VISIBLE LABEL DROPS SOME PARENTHETICALS so 24 headers fit; the exact
    // spreadsheet spelling is kept in meta and surfaced as a tooltip, so a
    // staffer reconciling against the file can always get the literal name.
    for (const [id, , sourceHeader] of SOURCE_ORDER) {
      expect(meta(id).sourceHeader, id).toBe(sourceHeader);
    }
  });

  it("makes every column sortable", () => {
    for (const column of prospectColumns) {
      expect(column.enableSorting, String(column.id)).not.toBe(false);
    }
  });
});

describe("prospectColumns — a null cell renders EMPTY", () => {
  // ⚠️ NEVER "0", "—", "null" OR "N/A". `Next Touch Date` is filled on 2 rows of
  // 1,435 and `Meeting Booked` on 8, so blank is the ORDINARY state of this
  // data. A placeholder in 1,433 cells would be ArcBase asserting something the
  // export did not say, 1,433 times.
  it.each(SOURCE_ORDER.map(([id]) => id))("%s renders nothing when the value is null", (id) => {
    const blank = Object.fromEntries(
      SOURCE_ORDER.map(([field]) => [field, null]),
    ) as Partial<OutreachProspect>;
    const { container } = cell(id, prospect(blank));

    expect(container).toBeEmptyDOMElement();
  });

  it("invents no placeholder glyph in any column", () => {
    for (const [id] of SOURCE_ORDER) {
      const { container, unmount } = cell(
        id,
        prospect({ [id]: null } as Partial<OutreachProspect>),
      );
      expect(container.textContent ?? "", id).not.toMatch(/—|N\/A|null|undefined/);
      unmount();
    }
  });

  it("renders a RECORDED value of '0' as 0 — a measurement, not a gap", () => {
    // The mirror image: 1,320 rows carry "0" in Follow-up Count and that is data.
    cell("followUpCount", prospect({ followUpCount: "0" }));

    expect(screen.getByText("0")).toBeInTheDocument();
  });
});

describe("prospectColumns — the LinkedIn URL", () => {
  it("renders a labelled external link, not a raw URL", () => {
    cell("linkedinUrl", prospect());

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://www.linkedin.com/in/dana-reyes");
    expect(link.textContent).toMatch(/profile/i);
  });

  it("opens in a new tab WITHOUT handing the opener over", () => {
    // ⚠️ `rel="noreferrer noopener"` IS NOT OPTIONAL on a target=_blank link to a
    // third-party profile: without it the opened page gets a handle on this one.
    cell("linkedinUrl", prospect());

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer noopener");
  });

  it("renders nothing at all when there is no URL", () => {
    const { container } = cell("linkedinUrl", prospect({ linkedinUrl: null }));

    expect(container).toBeEmptyDOMElement();
  });

  it("keeps the full URL reachable on hover", () => {
    cell("linkedinUrl", prospect());

    expect(screen.getByRole("link")).toHaveAttribute(
      "title",
      "https://www.linkedin.com/in/dana-reyes",
    );
  });
});

describe("prospectColumns — status columns use the pills", () => {
  it("renders Connection Status as a pill", () => {
    cell("connectionStatus", prospect({ connectionStatus: "Connected" }));

    expect(screen.getByTestId("outreach-pill")).toHaveAttribute("data-tone", "connected");
  });

  it("renders Reply Status as a pill coloured by BUCKET, labelled with the raw value", () => {
    cell("replyStatus", prospect({ replyStatus: "Replied 2026-07-13" }));

    expect(screen.getByText("Replied 2026-07-13")).toBeInTheDocument();
    expect(screen.getByTestId("outreach-pill")).toHaveAttribute("data-tone", "neutral");
  });

  it("renders 'Not Interested' UNCLASSIFIED in the table, exactly as the pill does", () => {
    // The end-to-end guard against the reference viewer's substring bug reaching
    // an actual cell.
    cell("replyStatus", prospect({ replyStatus: "Not Interested" }));

    expect(screen.getByTestId("outreach-pill")).toHaveAttribute("data-tone", "unclassified");
  });

  it("renders ICP Seg as a pill", () => {
    cell("icpSeg", prospect());

    expect(screen.getByTestId("outreach-pill")).toBeInTheDocument();
  });
});

describe("prospectColumns — long text stays readable", () => {
  it("clamps a long cell and keeps the full text on hover", () => {
    const long = "a".repeat(400);
    const { container } = cell("linkedinMessage", prospect({ linkedinMessage: long }));

    const node = container.firstElementChild;
    expect(node).toHaveAttribute("title", long);
    expect(node?.className).toMatch(/line-clamp-3/);
  });

  it("keeps the name on one line so a row is scannable", () => {
    const { container } = cell("fullName", prospect());

    expect(container.firstElementChild?.className).toMatch(/whitespace-nowrap/);
    expect(screen.getByText("Dana Reyes")).toBeInTheDocument();
  });

  it("shows a Notes value verbatim, email address included", () => {
    // 94% of Notes are filled and some carry emails. This page is staff-only;
    // the value is shown as stored rather than masked (ADR 0009 + ADR 0012).
    cell("notes", prospect({ notes: "dana@northwind.io" }));

    expect(screen.getByText("dana@northwind.io")).toBeInTheDocument();
  });
});
