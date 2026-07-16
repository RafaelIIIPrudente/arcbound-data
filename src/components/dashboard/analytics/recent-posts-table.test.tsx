import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { RecentPost } from "@/services/types";

import { RecentPostsTable } from "./recent-posts-table";

const posts: RecentPost[] = [
  {
    id: "POST-1",
    snippet: "A short recap of the quarter and what changed.",
    date: "Jul 13",
    format: "text",
    impressions: 1959,
    likes: 27,
    comments: 15,
  },
  {
    id: "POST-2",
    snippet: "Grateful to moderate a panel discussion this week.",
    date: "Jul 9",
    format: "image",
    impressions: 617,
    likes: 27,
    comments: 3,
  },
];

describe("RecentPostsTable", () => {
  it("renders a row per post with snippet, format badge, and metrics", () => {
    render(<RecentPostsTable posts={posts} postCount={267} />);

    expect(screen.getByText("A short recap of the quarter and what changed.")).toBeInTheDocument();
    expect(screen.getByText("text")).toBeInTheDocument();
    expect(screen.getByText("image")).toBeInTheDocument();
    // Impressions render with thousands separators.
    expect(screen.getByText("1,959")).toBeInTheDocument();
    // The header shows the total post count for the current filter.
    expect(screen.getByText("267 posts")).toBeInTheDocument();
  });
});
