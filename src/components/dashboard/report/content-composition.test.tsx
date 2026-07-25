import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { ContentComposition } from "@/services/types";

import { ContentComposition as ContentCompositionSection } from "./content-composition";

/** Eight posts, all analysable, all features present. */
const FULL: ContentComposition = {
  totalPosts: 8,
  analysedPosts: 8,
  unanalysablePosts: 0,
  hashtags: [
    { tag: "leadership", count: 5 },
    { tag: "saas", count: 3 },
    { tag: "ai", count: 2 },
  ],
  medianLength: 640,
  pastFold: 3,
  withQuestion: 4,
  withLink: 2,
  withMention: 5,
  withEmoji: 6,
};

describe("ContentComposition — the healthy case", () => {
  it("renders each hashtag case-folded with its usage count", () => {
    render(<ContentCompositionSection composition={FULL} />);
    expect(screen.getByText("#leadership (5)")).toBeInTheDocument();
    expect(screen.getByText("#saas (3)")).toBeInTheDocument();
    expect(screen.getByText("#ai (2)")).toBeInTheDocument();
  });

  it("renders the length figures and each content element", () => {
    render(<ContentCompositionSection composition={FULL} />);

    for (const label of [
      "Median length",
      "Asks a question",
      "Includes a link",
      "Mentions someone",
      "Uses emoji",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    expect(screen.getByText("640")).toBeInTheDocument(); // median chars
    expect(screen.getByText("4")).toBeInTheDocument(); // question
    expect(screen.getByText("2")).toBeInTheDocument(); // link
    expect(screen.getByText("5")).toBeInTheDocument(); // mention
    expect(screen.getByText("6")).toBeInTheDocument(); // emoji
    // The see-more fold line, in the brief's own words.
    expect(screen.getByText(/3 of 8 posts run past the .see more. fold/i)).toBeInTheDocument();
  });

  it("says nothing about what the content EARNED — compositional only", () => {
    const { container } = render(<ContentCompositionSection composition={FULL} />);
    // No ranking, no causal claims, no engagement — a grep of the rendered text
    // must find none of the forbidden framings.
    expect(container.textContent).not.toMatch(
      /top[- ]?performing|\bbest\b|\bdrives?\b|\bboosts?\b|recommended|engagement/i,
    );
  });

  it("keeps the whole section together across a page break (print-safe markup)", () => {
    const { container } = render(<ContentCompositionSection composition={FULL} />);
    expect((container.firstChild as HTMLElement).className).toContain("print-block");
  });

  it("shows no undated-text disclosure when every post has text", () => {
    render(<ContentCompositionSection composition={FULL} />);
    expect(screen.queryByText(/no post text/i)).not.toBeInTheDocument();
  });
});

describe("ContentComposition — genuine zero vs could-not-analyse", () => {
  it("renders 'No hashtags used' as a REAL ZERO when posts were analysed and used none", () => {
    const noTags: ContentComposition = { ...FULL, hashtags: [] };
    render(<ContentCompositionSection composition={noTags} />);

    // A fact, not an em dash — the posts were read; they simply had no hashtags.
    expect(screen.getByText(/no hashtags used/i)).toBeInTheDocument();
  });

  it("renders an EM DASH — not 'No hashtags used' — when nothing could be analysed", () => {
    // ⚠️ THE DISCRIMINATING PAIR. Every post is textless: we cannot say whether
    // they use hashtags, so it is "could not be analysed" (em dash), NOT a zero.
    const allTextless: ContentComposition = {
      totalPosts: 3,
      analysedPosts: 0,
      unanalysablePosts: 3,
      hashtags: [],
      medianLength: null,
      pastFold: 0,
      withQuestion: 0,
      withLink: 0,
      withMention: 0,
      withEmoji: 0,
    };
    render(<ContentCompositionSection composition={allTextless} />);

    expect(screen.queryByText(/no hashtags used/i)).not.toBeInTheDocument();
    // Median + the four elements + hashtags all render the em dash.
    expect(screen.getAllByText("—")).toHaveLength(6);
    // The fold line makes no claim when nothing was analysed.
    expect(screen.queryByText(/run past the .see more. fold/i)).not.toBeInTheDocument();
    // ...and the omission is disclosed.
    expect(screen.getByText(/no post text/i)).toBeInTheDocument();
  });
});

describe("ContentComposition — disclosure, overflow, and the empty report", () => {
  it("discloses textless posts in plain language, naming no raw column", () => {
    const someTextless: ContentComposition = {
      ...FULL,
      totalPosts: 8,
      analysedPosts: 6,
      unanalysablePosts: 2,
    };
    render(<ContentCompositionSection composition={someTextless} />);

    const disclosure = screen.getByText(/no post text/i);
    expect(disclosure.textContent).toMatch(/2 of 8/);
    expect(disclosure.textContent).not.toMatch(/post_content/);
  });

  it("caps the hashtag list and shows '+ N more' on overflow", () => {
    const many: ContentComposition = {
      ...FULL,
      hashtags: Array.from({ length: 10 }, (_, i) => ({ tag: `tag${i}`, count: 10 - i })),
    };
    render(<ContentCompositionSection composition={many} />);
    // Ten distinct tags, a top-8 display cap → two spill into "+ 2 more".
    expect(screen.getByText(/\+\s*2 more/)).toBeInTheDocument();
  });

  it("renders nothing for a client with zero posts", () => {
    const zero: ContentComposition = {
      totalPosts: 0,
      analysedPosts: 0,
      unanalysablePosts: 0,
      hashtags: [],
      medianLength: null,
      pastFold: 0,
      withQuestion: 0,
      withLink: 0,
      withMention: 0,
      withEmoji: 0,
    };
    const { container } = render(<ContentCompositionSection composition={zero} />);
    expect(container.firstChild).toBeNull();
  });
});
