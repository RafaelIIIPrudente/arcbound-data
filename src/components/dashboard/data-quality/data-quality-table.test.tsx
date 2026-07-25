import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DataQualityRow } from "@/services/types";

import { DataQualityTable } from "./data-quality-table";

function row(over: Partial<DataQualityRow> & { clientId: string }): DataQualityRow {
  return {
    clientName: `Client ${over.clientId}`,
    submitted: 10,
    attributed: 10,
    undated: 0,
    unknownFormat: 0,
    uploadCount: 2,
    lastIngest: "2026-07-20T09:00:00.000Z",
    ...over,
  };
}

/** Body rows only — `getAllByRole("row")` would include the header. */
function bodyRows() {
  return within(screen.getAllByRole("rowgroup")[1]!).getAllByRole("row");
}

describe("DataQualityTable", () => {
  it("renders the columns the screen promises", () => {
    render(<DataQualityTable rows={[row({ clientId: "c1" })]} />);

    for (const header of [
      "Client",
      "Submitted",
      "Attributed",
      "Undated",
      "Unknown type",
      "Last ingest",
    ]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
  });

  it("renders one row per client, linking to the client detail", () => {
    render(<DataQualityTable rows={[row({ clientId: "c1" }), row({ clientId: "c2" })]} />);

    expect(bodyRows()).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Client c1" })).toHaveAttribute("href", "/clients/c1");
  });

  it("shows an empty state when no clients are registered", () => {
    render(<DataQualityTable rows={[]} />);

    expect(screen.getByText("No clients registered yet.")).toBeInTheDocument();
  });

  it("uses no raw column names or enum tokens anywhere a user reads", () => {
    render(<DataQualityTable rows={[row({ clientId: "c1", unknownFormat: 3 })]} />);

    for (const token of [
      "client_id",
      "post_format_type",
      "estimated_post_date",
      "UNKNOWN",
      "bi.",
    ]) {
      expect(screen.queryByText(new RegExp(token))).not.toBeInTheDocument();
    }
  });
});

describe("submitted but nothing attributed back", () => {
  it("emphasises the row with a marker and a spoken explanation, not colour alone", () => {
    render(<DataQualityTable rows={[row({ clientId: "c1", submitted: 40, attributed: 0 })]} />);

    // ⚠️ Emphasis must survive with colour stripped — a colourblind or
    // high-contrast user gets the same signal from the glyph and the sr-only text.
    expect(
      screen.getByText(/no posts have been attributed back to this client/i),
    ).toBeInTheDocument();
    expect(within(bodyRows()[0]!).getByText("▲", { exact: false })).toBeInTheDocument();
  });

  it("says nothing accusatory — ArcBase cannot see WHY posts did not come back", () => {
    render(<DataQualityTable rows={[row({ clientId: "c1", submitted: 40, attributed: 0 })]} />);

    // A name mismatch, a client who stopped posting, and a downstream outage are
    // indistinguishable from here. The screen states two numbers, not a verdict.
    for (const word of [/broken/i, /failed/i, /error/i, /wrong/i, /invalid/i]) {
      expect(screen.queryByText(word)).not.toBeInTheDocument();
    }
  });

  it("does NOT emphasise a client who simply has not submitted anything", () => {
    render(<DataQualityTable rows={[row({ clientId: "c1", submitted: 0, attributed: 0 })]} />);

    // 0 submitted and 0 attributed is a consistent, unremarkable pair.
    expect(
      screen.queryByText(/no posts have been attributed back to this client/i),
    ).not.toBeInTheDocument();
  });

  it("does NOT emphasise when `submitted` is UNKNOWN", () => {
    // The comparison cannot be made at all — which is different from it failing.
    render(<DataQualityTable rows={[row({ clientId: "c1", submitted: null, attributed: 0 })]} />);

    expect(
      screen.queryByText(/no posts have been attributed back to this client/i),
    ).not.toBeInTheDocument();
  });
});

describe("a figure that could not be read is NOT a zero", () => {
  it("renders an unknown `submitted` as an em dash and a real zero as 0", () => {
    render(
      <DataQualityTable
        rows={[
          row({ clientId: "unknown", clientName: "Unknown Co", submitted: null }),
          row({ clientId: "zero", clientName: "Zero Co", submitted: 0, attributed: 0 }),
        ]}
      />,
    );

    const [unknown, zero] = bodyRows();

    // ⚠️ The distinction this repo has fixed twice. These two cells must never
    // render identically.
    expect(within(unknown!).getByText("—")).toBeInTheDocument();
    expect(within(unknown!).getByText(/Submitted posts could not be read/i)).toBeInTheDocument();
    // The zero row carries real zeroes and NO em dash anywhere.
    expect(within(zero!).getAllByText("0").length).toBeGreaterThan(0);
    expect(within(zero!).queryByText("—")).not.toBeInTheDocument();
  });

  it("distinguishes never-ingested from an unreadable ingest history", () => {
    render(
      <DataQualityTable
        rows={[
          row({ clientId: "never", clientName: "Never Co", lastIngest: null }),
          row({ clientId: "unknown", clientName: "Unknown Co", lastIngest: "unavailable" }),
        ]}
      />,
    );

    const [never, unknown] = bodyRows();

    // "Never" is a FACT; the em dash is the absence of one.
    expect(within(never!).getByText("Never")).toBeInTheDocument();
    expect(within(unknown!).getByText("—")).toBeInTheDocument();
    expect(within(unknown!).getByText(/Last ingest could not be read/i)).toBeInTheDocument();
  });

  it("renders genuinely zero undated and unknown-type counts as 0", () => {
    render(<DataQualityTable rows={[row({ clientId: "c1", undated: 0, unknownFormat: 0 })]} />);

    // Measured zeroes, not blanks — "we checked and there are none".
    expect(within(bodyRows()[0]!).getAllByText("0").length).toBeGreaterThanOrEqual(2);
  });

  it("formats the last ingest date in UTC, not the viewer's zone", () => {
    // A late-evening UTC timestamp would render as the previous day in a
    // negative-offset zone, silently disagreeing with every other date in the app.
    render(
      <DataQualityTable rows={[row({ clientId: "c1", lastIngest: "2026-07-20T23:30:00.000Z" })]} />,
    );

    expect(screen.getByText("Jul 20, 2026")).toBeInTheDocument();
  });
});
