import { beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { BiPostRow } from "@/services/analytics";
import { availablePeriods, buildClientReport } from "@/services/client-report";
import type { ClientReport, ReportPeriod } from "@/services/types";

import { PrintReport } from "./print-report";
import { ReportCover } from "./report-cover";

// Fixtures are built through the REAL seam rather than hand-written, so what the
// document is tested against is exactly what the page will hand it — including
// the empty shapes, which are the easy ones to get wrong by hand.

const ALL_TIME: ReportPeriod = { kind: "all", key: "all", label: "All time" };
const NOW = new Date("2026-07-22T09:00:00.000Z");

function biRow(overrides: Partial<BiPostRow> & { linkedin_post_id: string }): BiPostRow {
  return {
    client_id: "c1",
    client_name: "Dana Whitfield",
    post_url: null,
    post_content: "Post",
    post_age: null,
    estimated_post_date: "2026-07-05T10:00:00.000Z",
    impressions: 1000,
    likes: 40,
    comments: 8,
    reposts: 4,
    saves: 2,
    interactions: 52,
    provided_engagement_rate: null,
    calculated_engagement_rate: null,
    scraped_at: "2026-07-20T10:00:00.000Z",
    uploaded_at: null,
    ...overrides,
  };
}

function document_(report: ClientReport) {
  return (
    <>
      <ReportCover
        clientName="Dana Whitfield"
        linkedinUrl="https://www.linkedin.com/in/dana-whitfield"
        period={report.period}
        figures={report.keyPerformance.selected}
        now={NOW}
      />
      <PrintReport report={report} />
    </>
  );
}

describe("the printable document", () => {
  beforeAll(() => {
    // recharts observes its container even when explicitly sized; jsdom has no
    // implementation. The charts must still draw without it — see below.
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  it("renders the cover and every empty state for a client with no posts", () => {
    const report = buildClientReport([], new Map(), {
      period: ALL_TIME,
      now: NOW,
      followers: null,
      availablePeriods: availablePeriods([]),
    });

    expect(() => render(document_(report))).not.toThrow();

    // The cover still stands on its own — a client with no posts gets a real
    // document, not a blank page.
    expect(screen.getByText("Dana Whitfield")).toBeInTheDocument();
    // Stated on the cover and again on each all-time section — the wording is
    // asserted precisely in report-cover.test.tsx; here it just has to be there.
    expect(screen.getAllByText("All time · every post on record").length).toBeGreaterThan(0);

    // Key performance has its own wording; the four charts and the comparison
    // table share theirs.
    expect(screen.getByText("No posts in this period")).toBeInTheDocument();
    expect(screen.getAllByText("No posts in this period.")).toHaveLength(5);
  });

  it("draws every chart in an environment with no layout engine", () => {
    // THE POINT OF THIS TEST. jsdom measures every element as 0x0. A chart that
    // sized itself by measuring its parent would render nothing here — which is
    // the same failure that makes recharts print at zero width. These charts
    // take an explicit pixel size, so they draw regardless.
    const rows = [
      biRow({ linkedin_post_id: "p1", estimated_post_date: "2026-06-02T10:00:00.000Z" }),
      biRow({ linkedin_post_id: "p2", estimated_post_date: "2026-07-05T10:00:00.000Z" }),
    ];
    const formats = new Map([
      ["p1", "IMAGE"],
      ["p2", "document"],
    ]);
    const report = buildClientReport(rows, formats, {
      period: ALL_TIME,
      now: NOW,
      followers: 5000,
      availablePeriods: availablePeriods(rows),
    });

    const { container } = render(document_(report));

    const charts = container.querySelectorAll(".recharts-surface");
    expect(charts).toHaveLength(4);
    for (const chart of charts) {
      expect(chart.getAttribute("width")).toBe("700");
    }
  });

  it("names asset types in words, never as raw scraper tokens", () => {
    const rows = [biRow({ linkedin_post_id: "p1" })];
    const report = buildClientReport(rows, new Map([["p1", "slide_show"]]), {
      period: ALL_TIME,
      now: NOW,
      followers: null,
      availablePeriods: availablePeriods(rows),
    });

    render(document_(report));

    // Raw storage means the map holds "slide_show"; the document must say
    // "Slide show". This one leaves the building.
    expect(screen.getAllByText("Slide show").length).toBeGreaterThan(0);
    expect(screen.queryByText(/SLIDE_SHOW/)).not.toBeInTheDocument();
  });
});
