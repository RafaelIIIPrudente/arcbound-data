import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { ReviewPost } from "@/services/types";

import { FormatReview } from "./format-review";

// Radix Select drives its listbox with Pointer Events + layout APIs that jsdom
// does not implement. Polyfill them locally so the dropdown can actually open.
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

const posts: ReviewPost[] = [{ linkedin_post_id: "P1", snippet: "a post needing a format" }];

function renderReview() {
  return render(
    <FormatReview posts={posts} pending={false} onConfirm={vi.fn()} onSkip={vi.fn()} />,
  );
}

async function openFormatDropdown(): Promise<string[]> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: "Post format" }));
  const options = await screen.findAllByRole("option");
  return options.map((option) => option.textContent?.trim() ?? "");
}

describe("FormatReview format dropdown", () => {
  it("shows human-readable labels, never raw enum tokens", async () => {
    renderReview();
    const labels = await openFormatDropdown();

    expect(labels).toContain("Slide show");
    expect(labels).toContain("Instant share");
    // The whole point: SLIDE_SHOW / INSTANT_SHARE must never reach a human.
    for (const label of labels) {
      expect(label).not.toMatch(/[A-Z]{2,}|_/);
    }
  });

  it("offers the nine resolvable formats and never Unknown", async () => {
    renderReview();
    const labels = await openFormatDropdown();

    expect(labels).toHaveLength(9);
    expect(labels).not.toContain("Unknown");
  });
});
