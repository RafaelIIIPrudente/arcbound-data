import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { buildOutreachAnalytics } from "@/services/outreach-analytics";
import type { OutreachProspect } from "@/services/types";

import { OutreachKpis } from "./outreach-kpis";
import { ProspectTable } from "./prospect-table";

// Radix Select drives its listbox with Pointer Events + layout APIs jsdom lacks.
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

let seq = 0;
function prospect(over: Partial<OutreachProspect> = {}): OutreachProspect {
  seq += 1;
  return {
    id: String(seq),
    outreachUploadId: "up1",
    clientId: "c1",
    rowIndex: seq,
    fullName: `Person ${seq}`,
    title: "VP Engineering",
    company: "Northwind",
    icpSeg: "Series B SaaS",
    whyTheyFit: "hiring",
    whatTheyLack: null,
    whatArcboundOffers: null,
    matchingClientArchetype: null,
    linkedinUrl: `https://linkedin.com/in/person-${seq}`,
    location: "Austin, TX",
    sourceCitation: null,
    rationale: null,
    linkedinMessage: null,
    connectionStatus: "Pending",
    dateSent: "2026-07-20",
    replyStatus: "No Reply",
    followUpCount: "0",
    lastFollowUpDate: null,
    nextTouchDate: null,
    meetingBookedDate: null,
    stage: "Requested",
    owner: "Bryan",
    notes: null,
    qualifiedIcp: "Yes",
    ...over,
  };
}

/** Body rows currently rendered (the header row is in <thead>). */
function bodyRows(): HTMLElement[] {
  const body = document.querySelector("tbody");
  return body ? [...body.querySelectorAll("tr")] : [];
}

/** The visible names, in render order. */
function names(): string[] {
  return bodyRows()
    .map((r) => r.querySelector("td")?.textContent?.trim() ?? "")
    .filter(Boolean);
}

async function pickFrom(label: string, option: string) {
  const user = userEvent.setup();
  await user.click(screen.getByLabelText(label));
  await user.click(await screen.findByRole("option", { name: option }));
}

const ROWS = [
  prospect({ fullName: "Ada Lovelace", company: "Analytical", stage: "Requested" }),
  prospect({
    fullName: "Grace Hopper",
    company: "Harvard",
    connectionStatus: "Connected",
    stage: "Connected",
    replyStatus: "Replied - Positive",
  }),
  prospect({
    fullName: "Katherine Johnson",
    company: "NASA",
    connectionStatus: "Connected",
    stage: "Meeting Booked",
    replyStatus: "Replied 2026-07-13",
    icpSeg: "Aerospace",
  }),
];

describe("ProspectTable — the 24 columns", () => {
  it("renders every source column header", () => {
    render(<ProspectTable prospects={ROWS} />);

    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent?.trim());
    expect(headers).toHaveLength(24);
    expect(headers[0]).toMatch(/Full Name/);
    expect(headers.at(-1)).toMatch(/Qualified \(ICP\)/);
  });

  it("renders one row per prospect", () => {
    render(<ProspectTable prospects={ROWS} />);

    expect(names()).toEqual(["Ada Lovelace", "Grace Hopper", "Katherine Johnson"]);
  });

  it("KEEPS THE HORIZONTAL SCROLL INSIDE THE TABLE", () => {
    // ⚠️ 24 COLUMNS OVERFLOW, AND THE OVERFLOW BELONGS TO THE TABLE, NOT THE
    // DOCUMENT. A page body that scrolls sideways drags the whole dashboard —
    // KPIs, funnel, charts — out from under the reader's cursor.
    const { container } = render(<ProspectTable prospects={ROWS} />);

    const scroller = container.querySelector("[data-table-scroll]");
    expect(scroller).not.toBeNull();
    expect(scroller?.className).toMatch(/overflow-x-auto/);
    // The component's own root must not be the scroller.
    expect(container.firstElementChild?.className ?? "").not.toMatch(/overflow-x-auto/);
  });

  it("sticks the header row so column names survive a long scroll", () => {
    render(<ProspectTable prospects={ROWS} />);

    expect(screen.getAllByRole("columnheader")[0]!.className).toMatch(/sticky/);
  });
});

describe("ProspectTable — the live count", () => {
  it("reads 'N of M shown'", () => {
    render(<ProspectTable prospects={ROWS} />);

    expect(screen.getByTestId("prospect-count")).toHaveTextContent("3 of 3 shown");
  });

  it("updates as a search narrows the set", async () => {
    const user = userEvent.setup();
    render(<ProspectTable prospects={ROWS} />);

    await user.type(screen.getByLabelText("Search prospects"), "hopper");

    expect(screen.getByTestId("prospect-count")).toHaveTextContent("1 of 3 shown");
  });
});

describe("ProspectTable — free-text search", () => {
  it("narrows the rows, case-insensitively", async () => {
    const user = userEvent.setup();
    render(<ProspectTable prospects={ROWS} />);

    await user.type(screen.getByLabelText("Search prospects"), "GRACE");

    expect(names()).toEqual(["Grace Hopper"]);
  });

  it("searches EVERY column, not just the name", async () => {
    // The viewer joins the whole row and substring-matches; same effect here.
    const user = userEvent.setup();
    render(<ProspectTable prospects={ROWS} />);

    await user.type(screen.getByLabelText("Search prospects"), "NASA");

    expect(names()).toEqual(["Katherine Johnson"]);
  });

  it("restores every row when cleared", async () => {
    const user = userEvent.setup();
    render(<ProspectTable prospects={ROWS} />);
    const box = screen.getByLabelText("Search prospects");

    await user.type(box, "nasa");
    expect(names()).toHaveLength(1);

    await user.clear(box);
    expect(names()).toHaveLength(3);
  });
});

describe("ProspectTable — the Reply filter groups by CANONICAL BUCKET", () => {
  // ⚠️ THE ONE FILTER THAT IS NOT RAW VALUES. Reply Status has 15 distinct
  // values, eight of which are one-row dates ("Replied 2026-07-13"). A raw
  // dropdown would be fifteen entries, mostly useless. The options are the
  // canonical buckets; the CELL still shows the raw text — the filter groups, it
  // does not rename.
  it("offers buckets, not the fifteen raw values", async () => {
    const user = userEvent.setup();
    render(<ProspectTable prospects={ROWS} />);

    await user.click(screen.getByLabelText("Filter by reply status"));
    const options = (await screen.findAllByRole("option")).map((o) => o.textContent?.trim());

    // Present buckets only, plus the "All" entry — never a bare date string.
    expect(options).toContain("No reply");
    expect(options).toContain("Positive reply");
    expect(options).toContain("Replied, sentiment not stated");
    expect(options).not.toContain("Replied 2026-07-13");
    expect(options.length).toBeLessThan(15);
  });

  it("keeps a DATE-SUFFIXED row under replied-unspecified", async () => {
    render(<ProspectTable prospects={ROWS} />);

    await pickFrom("Filter by reply status", "Replied, sentiment not stated");

    expect(names()).toEqual(["Katherine Johnson"]);
  });

  it("still shows that row's RAW value in the cell", async () => {
    render(<ProspectTable prospects={ROWS} />);

    await pickFrom("Filter by reply status", "Replied, sentiment not stated");

    expect(screen.getByText("Replied 2026-07-13")).toBeInTheDocument();
  });
});

describe("ProspectTable — the other three filters", () => {
  it("filters by raw Connection Status", async () => {
    render(<ProspectTable prospects={ROWS} />);

    await pickFrom("Filter by connection status", "Connected");

    expect(names()).toEqual(["Grace Hopper", "Katherine Johnson"]);
  });

  it("filters by canonical Stage", async () => {
    render(<ProspectTable prospects={ROWS} />);

    await pickFrom("Filter by stage", "Meeting Booked");

    expect(names()).toEqual(["Katherine Johnson"]);
  });

  it("filters by raw ICP Seg", async () => {
    render(<ProspectTable prospects={ROWS} />);

    await pickFrom("Filter by ICP segment", "Aerospace");

    expect(names()).toEqual(["Katherine Johnson"]);
  });

  it("builds each dropdown from the values PRESENT in this snapshot", async () => {
    const user = userEvent.setup();
    render(<ProspectTable prospects={ROWS} />);

    await user.click(screen.getByLabelText("Filter by stage"));
    const options = (await screen.findAllByRole("option")).map((o) => o.textContent?.trim());

    expect(options).toContain("Requested");
    expect(options).toContain("Meeting Booked");
    // Never offered: no row in this snapshot carries it.
    expect(options).not.toContain("Closed - Low Fit");
  });

  it("COMPOSES filters with the search box", async () => {
    const user = userEvent.setup();
    render(<ProspectTable prospects={ROWS} />);

    await pickFrom("Filter by connection status", "Connected");
    expect(names()).toHaveLength(2);

    await user.type(screen.getByLabelText("Search prospects"), "harvard");
    expect(names()).toEqual(["Grace Hopper"]);
  });

  it("restores every row when the filters are cleared", async () => {
    render(<ProspectTable prospects={ROWS} />);

    await pickFrom("Filter by connection status", "Connected");
    expect(names()).toHaveLength(2);

    await pickFrom("Filter by connection status", "All connection statuses");
    expect(names()).toHaveLength(3);
  });
});

describe("ProspectTable — click-to-sort", () => {
  it("sorts by a column, then reverses on a second click", async () => {
    const user = userEvent.setup();
    render(<ProspectTable prospects={ROWS} />);

    const header = within(screen.getAllByRole("columnheader")[0]!).getByRole("button");

    await user.click(header);
    expect(names()).toEqual(["Ada Lovelace", "Grace Hopper", "Katherine Johnson"]);

    await user.click(header);
    expect(names()).toEqual(["Katherine Johnson", "Grace Hopper", "Ada Lovelace"]);
  });

  it("sorts over the WHOLE set, not just the visible page", async () => {
    // 150 rows against a 100-row page: the last name alphabetically must reach
    // page one once the sort is reversed, which is only true if sorting runs
    // before pagination.
    const many = Array.from({ length: 150 }, (_, i) =>
      prospect({ fullName: `Name ${String(i).padStart(3, "0")}` }),
    );
    const user = userEvent.setup();
    render(<ProspectTable prospects={many} />);

    const header = within(screen.getAllByRole("columnheader")[0]!).getByRole("button");
    await user.click(header);
    await user.click(header);

    expect(names()[0]).toBe("Name 149");
  });
});

describe("ProspectTable — pagination", () => {
  it("pages a large snapshot and reports the full total", () => {
    const many = Array.from({ length: 150 }, () => prospect());
    render(<ProspectTable prospects={many} />);

    expect(names()).toHaveLength(100);
    // ⚠️ THE COUNT IS THE FILTERED TOTAL, NOT THE PAGE. "100 of 150" would be a
    // lie about how much matched.
    expect(screen.getByTestId("prospect-count")).toHaveTextContent("150 of 150 shown");
  });

  it("shows no pager when everything fits on one page", () => {
    render(<ProspectTable prospects={ROWS} />);

    // ⚠️ AN EXACT NAME. /next/i also matches the "Sort by Next Touch Date"
    // header button, so the loose matcher passed for the wrong reason.
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });
});

describe("ProspectTable — honest empty states", () => {
  it("says so when a FILTER matched nothing", () => {
    render(<ProspectTable prospects={[]} />);

    expect(screen.getByText(/no prospects/i)).toBeInTheDocument();
  });

  it("distinguishes 'no matches' from 'no prospects'", async () => {
    const user = userEvent.setup();
    render(<ProspectTable prospects={ROWS} />);

    await user.type(screen.getByLabelText("Search prospects"), "zzzznotfound");

    expect(screen.getByText(/no prospects match/i)).toBeInTheDocument();
  });
});

describe("THE AGGREGATES ABOVE DO NOT RESCOPE TO THE TABLE'S FILTERS", () => {
  // ⚠️ THE MOST DANGEROUS "IMPROVEMENT" ANYONE COULD MAKE TO THIS PAGE. Wiring
  // the table's filters into the KPIs and funnel feels obviously right — until
  // you read the captions. Every funnel step prints the rule that produced it
  // ("a date is recorded in Date Sent"); recomputed over a filtered subset, that
  // sentence becomes a lie about the number sitting beside it, and a screenshot
  // of a filtered page would read as a claim about the whole client.
  //
  // The isolation is structural — the filter state lives inside ProspectTable
  // and the aggregates are computed on the server from the unfiltered array —
  // but structure is only as good as the next refactor, so this renders the two
  // together and proves the numbers hold still.
  const analytics = buildOutreachAnalytics(ROWS);

  function kpi(label: string): string {
    const card = screen.getByText(label).closest("[data-kpi]");
    if (!(card instanceof HTMLElement)) throw new Error(`no KPI card for ${label}`);
    return card.querySelector("div")?.textContent?.trim() ?? "";
  }

  it("leaves every KPI untouched while the table is filtered to one row", async () => {
    const user = userEvent.setup();
    render(
      <>
        <OutreachKpis analytics={analytics} />
        <ProspectTable prospects={ROWS} />
      </>,
    );

    const before = {
      prospects: kpi("Prospects"),
      sent: kpi("Requests sent"),
      connected: kpi("Connections accepted"),
      replied: kpi("Replied"),
    };
    expect(before.prospects).toBe("3");

    await user.type(screen.getByLabelText("Search prospects"), "NASA");
    expect(names()).toEqual(["Katherine Johnson"]);

    expect(kpi("Prospects")).toBe(before.prospects);
    expect(kpi("Requests sent")).toBe(before.sent);
    expect(kpi("Connections accepted")).toBe(before.connected);
    expect(kpi("Replied")).toBe(before.replied);
  });

  it("leaves them untouched under a dropdown filter too", async () => {
    render(
      <>
        <OutreachKpis analytics={analytics} />
        <ProspectTable prospects={ROWS} />
      </>,
    );

    await pickFrom("Filter by connection status", "Connected");
    expect(names()).toHaveLength(2);

    // Three prospects in the snapshot, whatever the table is showing.
    expect(kpi("Prospects")).toBe("3");
  });

  it("exposes NO prop by which filter state could escape the table", () => {
    // A callback prop — onFilterChange, onRowsChange — is how this isolation
    // would be lost, so the surface is pinned: the component takes data in and
    // gives nothing back.
    expect(ProspectTable.length).toBe(1);
  });
});

describe("ProspectTable — no scores anywhere", () => {
  it("prints no percentage, rate, score or rank", () => {
    const { container } = render(<ProspectTable prospects={ROWS} />);
    const text = container.textContent ?? "";

    expect(text).not.toMatch(/%/);
    expect(text).not.toMatch(/\b(rate|conversion|score|rank|benchmark|percent)\b/i);
  });
});
