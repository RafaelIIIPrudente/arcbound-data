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

  it("⚠️ names the TRUE consequence — filed under the selected client, not lost", async () => {
    // ⚠️ THE CONSEQUENCE FLIPPED WITH ADR 0010. Attribution is now the
    // `client_id` stamped from the operator's own selection, so nothing vanishes:
    // these posts WILL be filed under this client. The danger became
    // MISATTRIBUTION, and its remedy is changing the selection — not aligning
    // names, which no longer affects anything.
    //
    // ⚠️ THE PREVIOUS VERSION OF THIS TEST PINNED THE LIE. It asserted
    // `/won't appear|never appear/i`, which is satisfied by exactly the sentence
    // that ADR 0010 makes false — so the copy could have stayed wrong forever
    // with this test green. The negative below is the tripwire.
    renderIt();

    const text = document.body.textContent ?? "";
    expect(text).toMatch(/files posts by the client you selected/i);
    expect(text).toMatch(/filed under Eitan Hoenig anyway/i);
    expect(text).toMatch(/go back and change the client/i);
    expect(text).not.toMatch(/won't appear|never appear|will not appear/i);
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

  it("distinguishes the authors that DO match in a mixed upload", async () => {
    // ⚠️ Partial mismatches are the confusing case, but no longer because some
    // posts vanish — all five are filed under the selected client. What differs
    // is only whether the scrape agrees about who wrote them, so the badge names
    // the AUTHOR, not an outcome.
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
    expect(screen.getByText("author matches")).toBeInTheDocument();
    expect(screen.getByText("author differs")).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/other 3 carry a matching author name/i);
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
