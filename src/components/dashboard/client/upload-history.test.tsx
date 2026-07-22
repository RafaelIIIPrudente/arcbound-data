import { render, screen } from "@testing-library/react";
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
    createdAt: "2026-07-10T08:00:00.000Z",
  },
];

describe("UploadHistory", () => {
  it("renders a row per upload with source, counts, and followers", () => {
    render(<UploadHistory uploads={uploads} />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("CSV")).toBeInTheDocument();
    expect(screen.getByText("JSON")).toBeInTheDocument();
    expect(screen.getByText("18,420")).toBeInTheDocument(); // followers, formatted
    expect(screen.getByRole("cell", { name: "—" })).toBeInTheDocument(); // null followers → dash
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
