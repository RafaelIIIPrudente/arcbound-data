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
});
