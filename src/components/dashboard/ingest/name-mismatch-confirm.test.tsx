import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AuthorMatchReport } from "@/lib/author-match";

import { NameMismatchConfirm } from "./name-mismatch-confirm";

/** The production string, verbatim (2026-08-18). */
const EITAN = "Eitan Hoenig Eitan Hoenig • You Premium • You";

const REPORT: AuthorMatchReport = {
  clientName: "Eitan Hoenig",
  authors: [
    {
      postName: EITAN,
      cleaned: "Eitan Hoenig Eitan Hoenig • You Premium",
      count: 14,
      matches: false,
    },
  ],
  total: 14,
  mismatched: 14,
};

function renderIt(over: Partial<React.ComponentProps<typeof NameMismatchConfirm>> = {}) {
  const props = {
    report: REPORT,
    pending: false,
    onConfirm: vi.fn(),
    onBack: vi.fn(),
    ...over,
  };
  render(<NameMismatchConfirm {...props} />);
  return props;
}

describe("NameMismatchConfirm — evidence, not a verdict", () => {
  it("⚠️ shows the SCRAPED STRING VERBATIM, with its post count", async () => {
    // "14 of 14 don't match" leaves staff no way to diagnose. The actual string
    // is what shows the duplicated name and the stray Premium badge, and lets
    // someone take it to whoever owns the scraper.
    renderIt();

    expect(screen.getByText(EITAN)).toBeInTheDocument();
    expect(screen.getByText(/14 posts/)).toBeInTheDocument();
  });

  it("shows the client's name beside it — the other half of the comparison", async () => {
    renderIt();

    expect(screen.getAllByText("Eitan Hoenig").length).toBeGreaterThan(0);
  });

  it("shows what the match actually compares, since it is not the raw string", async () => {
    // The join strips one trailing " • You". Showing only the raw string would
    // leave a reader thinking that was the problem.
    renderIt();

    // Rendered as "matched as: <cleaned>", so the label is asserted too — the
    // bare string alone would not say the screen explained WHY it is shown.
    expect(
      screen.getByText("matched as: Eitan Hoenig Eitan Hoenig • You Premium"),
    ).toBeInTheDocument();
  });

  it("⚠️ says plainly that NOTHING has been uploaded yet", async () => {
    // The screen this replaces sat under a success summary. If a reader cannot
    // tell whether the write already happened, the interruption is worthless.
    renderIt();

    expect(screen.getByText(/nothing has been uploaded/i)).toBeInTheDocument();
  });

  it("names the consequence — the posts upload and then do not appear", async () => {
    renderIt();

    // Said twice on purpose: once as prose ("never appear anywhere") and once as
    // a per-author badge. Both are the consequence, so both count.
    expect(screen.getAllByText(/won't appear|never appear/i).length).toBeGreaterThan(0);
  });

  it("lets staff proceed deliberately", async () => {
    const user = userEvent.setup();
    const props = renderIt();

    await user.click(screen.getByRole("button", { name: /upload anyway/i }));

    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });

  it("lets staff go back without uploading", async () => {
    const user = userEvent.setup();
    const props = renderIt();

    await user.click(screen.getByRole("button", { name: /go back/i }));

    expect(props.onBack).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it("disables both controls while a submit is in flight", async () => {
    renderIt({ pending: true });

    expect(screen.getByRole("button", { name: /upload anyway/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /go back/i })).toBeDisabled();
  });

  it("distinguishes the authors that WILL match in a mixed upload", async () => {
    // Partial mismatches are the confusing case: some posts appear, some vanish.
    renderIt({
      report: {
        clientName: "Eitan Hoenig",
        authors: [
          { postName: EITAN, cleaned: "x", count: 2, matches: false },
          { postName: "Eitan Hoenig • You", cleaned: "Eitan Hoenig", count: 3, matches: true },
        ],
        total: 5,
        mismatched: 2,
      },
    });

    expect(screen.getByText(/2 of 5/)).toBeInTheDocument();
    // The matching author is labelled, and the prose accounts for the remainder.
    expect(screen.getByText("will appear")).toBeInTheDocument();
    expect(screen.getByText(/other 3 will appear/i)).toBeInTheDocument();
  });

  it("renders a missing author name legibly rather than as a blank row", async () => {
    renderIt({
      report: {
        clientName: "Eitan Hoenig",
        authors: [{ postName: "", cleaned: "", count: 1, matches: false }],
        total: 1,
        mismatched: 1,
      },
    });

    expect(screen.getByText(/no author name/i)).toBeInTheDocument();
  });

  it("⚠️ never offers to rewrite the scraped name to force a match", async () => {
    // ADR 0009 forbids reinterpreting scraped values, and guessing which half of
    // a mangled string is the real name is how a post lands on the wrong client.
    renderIt();

    expect(screen.queryByRole("button", { name: /fix|rename|correct|clean/i })).toBeNull();
  });
});
