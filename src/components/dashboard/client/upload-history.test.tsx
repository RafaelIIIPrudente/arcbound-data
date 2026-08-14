import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Upload } from "@/services/types";

import { UploadHistory } from "./upload-history";

const uploads: Upload[] = [
  {
    id: "u1",
    clientId: "c1",
    sourceType: "csv",
    rowsInserted: 5,
    rowsUpdated: 2,
    rowsUnchanged: 1,
    followerCount: 18420,
    connectionsCount: 4820,
    createdAt: "2026-07-16T09:12:00.000Z",
  },
  {
    id: "u2",
    clientId: "c1",
    sourceType: "json",
    rowsInserted: 3,
    rowsUpdated: 0,
    rowsUnchanged: 0,
    followerCount: null,
    connectionsCount: null,
    createdAt: "2026-07-10T08:00:00.000Z",
  },
];

/** The data row for one upload, found by its (unique) upload date. */
function rowFor(dateLabel: string) {
  return screen.getAllByRole("row").find((r) => within(r).queryByText(new RegExp(dateLabel)))!;
}

describe("UploadHistory", () => {
  it("renders a row per upload with source, counts, and followers", () => {
    render(<UploadHistory uploads={uploads} />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("CSV")).toBeInTheDocument();
    expect(screen.getByText("JSON")).toBeInTheDocument();
    expect(screen.getByText("18,420")).toBeInTheDocument(); // followers, formatted
    // Both counts are absent on the second upload, so two dashes are expected.
    expect(screen.getAllByRole("cell", { name: "—" })).toHaveLength(2);
  });

  it("shows the empty state when there are no uploads", () => {
    render(<UploadHistory uploads={[]} />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("No uploads yet")).toBeInTheDocument();
  });

  it("says the history could not be LOADED — never 'No uploads yet' — on a failed read", () => {
    render(<UploadHistory uploads={null} />);

    // ⚠️ The distinction the whole change exists for. "No uploads yet" is a
    // claim about the client; this is a statement about the read.
    expect(screen.getByText("Upload history could not be loaded.")).toBeInTheDocument();
    expect(screen.queryByText("No uploads yet")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("UploadHistory — the timestamp names its clock", () => {
  it("marks the upload time UTC, because it is rendered in UTC", () => {
    // ⚠️ AN INSTANT WITHOUT A ZONE IS NOT A TIME. This column is forced to
    // `timeZone: "UTC"`, so "09:12" is 09:12 UTC — but a reviewer in India
    // (UTC+5:30) and an operator in Manila (UTC+8) both read it as local and are
    // both wrong, by different amounts, with nothing on screen to reveal it.
    render(<UploadHistory uploads={uploads} />);

    expect(
      within(rowFor("Jul 16, 2026")).getByText("Jul 16, 2026 · 09:12 UTC"),
    ).toBeInTheDocument();
  });

  it("labels EVERY timestamp, not just the newest", () => {
    render(<UploadHistory uploads={uploads} />);

    for (const cell of screen.getAllByText(/\d{2}:\d{2}/)) {
      expect(cell.textContent, cell.textContent ?? "").toMatch(/\d{2}:\d{2} UTC$/);
    }
  });

  it("leaves an unparseable timestamp exactly as it arrived, with no zone claimed", () => {
    // ⚠️ The existing passthrough must NOT gain a "UTC" it cannot vouch for:
    // labelling a string we failed to read as UTC would assert a zone nobody
    // measured — the prose equivalent of a fabricated figure.
    render(<UploadHistory uploads={[{ ...uploads[0]!, createdAt: "not-a-date" }]} />);

    expect(screen.getByText("not-a-date")).toBeInTheDocument();
    expect(screen.queryByText(/not-a-date.*UTC/)).not.toBeInTheDocument();
  });
});

describe("UploadHistory — the connection count column", () => {
  it("gives connections its own column beside Followers", () => {
    render(<UploadHistory uploads={uploads} />);

    expect(screen.getByRole("columnheader", { name: "Followers" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Connections" })).toBeInTheDocument();
  });

  it("prints the recorded connection count for the scrape that captured one", () => {
    render(<UploadHistory uploads={uploads} />);

    expect(within(rowFor("Jul 16, 2026")).getByText("4,820")).toBeInTheDocument();
  });

  it("renders an ABSENT connection count as a gap — never 0", () => {
    // ⚠️ THE ACCEPTANCE CASE, IN THE PLACE STAFF LOOK FIRST. Every historical
    // upload has no connection count; a column of zeros here would tell the whole
    // book that these clients have no connections.
    render(<UploadHistory uploads={uploads} />);

    const row = rowFor("Jul 10, 2026");
    const cells = within(row).getAllByRole("cell");
    // The connections cell is the last one, and it is a gap — NOT the `0` that
    // the (genuinely zero) Updated and Unchanged tallies in the same row show.
    expect(cells.at(-1)).toHaveTextContent("—");
    expect(cells.at(-1)).not.toHaveTextContent("0");
    expect(within(row).getAllByRole("cell", { name: "—" })).toHaveLength(2);
  });

  it("keeps a GENUINE zero as 0 — a measured zero is not a gap", () => {
    render(
      <UploadHistory
        uploads={[{ ...uploads[0]!, id: "u3", followerCount: 10, connectionsCount: 0 }]}
      />,
    );

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "—" })).not.toBeInTheDocument();
  });
});
