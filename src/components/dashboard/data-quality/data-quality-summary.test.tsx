import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DataQuality, DataQualitySources } from "@/services/types";

import { DataQualitySummary } from "./data-quality-summary";

const HEALTHY: DataQualitySources = {
  clientsUnavailable: false,
  postsUnavailable: false,
  postsTruncated: false,
  uploadsUnavailable: false,
};

const NO_RATE_FINDINGS: DataQuality["rates"] = {
  postsMissingRate: 0,
  rateDisagreements: 0,
  rateComparablePosts: 0,
  rateMedianRatio: null,
  rateScale: null,
  aggregateFormulaMatches: null,
  formulaCheckedPosts: 0,
  formulaMismatches: 0,
};

function data(over: Partial<DataQuality> = {}): DataQuality {
  return {
    rows: [],
    unattributedPosts: 0,
    rates: NO_RATE_FINDINGS,
    sources: HEALTHY,
    ...over,
  };
}

describe("DataQualitySummary", () => {
  it("leads with the unattributed-post figure", () => {
    render(<DataQualitySummary data={data({ unattributedPosts: 42 })} />);

    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText(/Posts not matched to a client/i)).toBeInTheDocument();
  });

  it("renders a real zero as 0, not as unknown", () => {
    // Three clients, so the "Clients tracked" card reads 3 and the only "0" on
    // screen is the figure under test.
    render(
      <DataQualitySummary
        data={data({
          unattributedPosts: 0,
          rows: ["a", "b", "c"].map((id) => ({
            clientId: id,
            clientName: id,
            submitted: 1,
            attributed: 1,
            undated: 0,
            unknownFormat: 0,
            uploadCount: 1,
            lastIngest: "2026-07-20T09:00:00.000Z",
          })),
        })}
      />,
    );

    // The read succeeded and everything matched — a finding, not missing data.
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("renders an unknown figure as an em dash with a spoken explanation", () => {
    render(<DataQualitySummary data={data({ unattributedPosts: null })} />);

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText(/unattributed post count could not be read/i)).toBeInTheDocument();
  });

  it("explains that matching happens downstream, without blaming anything", () => {
    render(<DataQualitySummary data={data()} />);

    expect(screen.getByText(/matched to clients after they leave ArcBase/i)).toBeInTheDocument();
    for (const word of [/broken/i, /failed/i, /error/i]) {
      expect(screen.queryByText(word)).not.toBeInTheDocument();
    }
  });

  it("shows no source notices at all when every source answered in full", () => {
    render(<DataQualitySummary data={data()} />);

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});

describe("the three source states are visually distinct", () => {
  it("says the post read was TRUNCATED — figures are a minimum, not a total", () => {
    render(<DataQualitySummary data={data({ sources: { ...HEALTHY, postsTruncated: true } })} />);

    // ⚠️ Truncated is NOT unavailable. The rows are real; there are just more of
    // them than were read. Saying "minimum, not a total" is the honest framing,
    // and it must not read as a failure.
    expect(screen.getByText(/minimum, not a total/i)).toBeInTheDocument();
    expect(screen.queryByText(/couldn’t be read/i)).not.toBeInTheDocument();
  });

  it("says the post read was UNAVAILABLE, in different words from truncation", () => {
    render(
      <DataQualitySummary
        data={data({ unattributedPosts: null, sources: { ...HEALTHY, postsUnavailable: true } })}
      />,
    );

    expect(screen.getByText(/Post data couldn’t be read/i)).toBeInTheDocument();
    expect(screen.queryByText(/minimum, not a total/i)).not.toBeInTheDocument();
  });

  it("names the uploads source specifically when only it is missing", () => {
    render(
      <DataQualitySummary data={data({ sources: { ...HEALTHY, uploadsUnavailable: true } })} />,
    );

    expect(screen.getByText(/Upload history couldn’t be read/i)).toBeInTheDocument();
    // Post figures are untouched by an uploads failure, so nothing may imply they are.
    expect(screen.queryByText(/Post data couldn’t be read/i)).not.toBeInTheDocument();
  });

  it("reports several failing sources at once, one notice each", () => {
    render(
      <DataQualitySummary
        data={data({
          unattributedPosts: null,
          sources: {
            clientsUnavailable: true,
            postsUnavailable: true,
            postsTruncated: false,
            uploadsUnavailable: true,
          },
        })}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});
