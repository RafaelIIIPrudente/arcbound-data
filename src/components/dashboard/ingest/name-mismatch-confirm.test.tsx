import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AuthorMatchReport } from "@/lib/author-match";

import { NameMismatchConfirm } from "./name-mismatch-confirm";

/** The production string, verbatim (2026-08-18). */
const EITAN = "Eitan Hoenig Eitan Hoenig • You Premium • You";

/**
 * ⚠️ THE DEFAULT FIXTURE MOVED OFF EITAN ON 2026-08-20, AND HAD TO. This screen
 * only ever renders for a GENUINE mismatch, and EITAN is no longer one — the
 * author block around this Client's own name is now tolerated
 * (docs/decisions/2026-08-20-badge-decorated-author-names.md). Keeping it here
 * would have tested a screen against data the action can no longer produce.
 *
 * `Charlene Li • You` is what these tests always meant: someone else entirely.
 * The residue is what the guard could not account for after removing the
 * Client's name and known chrome.
 */
const WRONG = "Charlene Li • You";

/** The 2026-08-20 production block, for a Client called Raj Singh. */
const RAJ_BLOCK = "Raj Singh Raj Singh • You Verified • You";

const REPORT: AuthorMatchReport = {
  clientName: "Eitan Hoenig",
  authors: [{ postName: WRONG, residue: "Charlene Li", count: 14, verdict: "mismatch" }],
  total: 14,
  mismatched: 14,
  decorated: 0,
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
    // is what names the author the scrape claims, so someone can see at a glance
    // whether the wrong file or the wrong Client was picked.
    renderIt();

    expect(screen.getByText(WRONG)).toBeInTheDocument();
    expect(screen.getByText(/14 posts/)).toBeInTheDocument();
  });

  it("shows the client's name beside it — the other half of the comparison", async () => {
    renderIt();

    expect(screen.getAllByText("Eitan Hoenig").length).toBeGreaterThan(0);
  });

  it("shows what could NOT be accounted for, since the raw string doesn't explain it", async () => {
    // ⚠️ RE-TARGETED FROM "matched as: <cleaned>", WHICH DESCRIBED A DEAD RULE.
    // `cleaned` was the scraped string minus one trailing " • You" — the value
    // the old predicate compared. The predicate now strips the CLIENT'S name and
    // known chrome and looks at the leftover, so the old line explained a
    // comparison the code had stopped making. The label is still asserted with
    // the value: the bare string alone would not say the screen explained WHY.
    renderIt();

    expect(screen.getByText("couldn’t account for: Charlene Li")).toBeInTheDocument();
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
          { postName: WRONG, residue: "Charlene Li", count: 2, verdict: "mismatch" },
          { postName: "Eitan Hoenig • You", residue: "", count: 3, verdict: "match" },
        ],
        total: 5,
        mismatched: 2,
        decorated: 0,
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
        authors: [{ postName: "", residue: "", count: 1, verdict: "mismatch" }],
        total: 1,
        mismatched: 1,
        decorated: 0,
      },
    });

    expect(screen.getByText(/no author name/i)).toBeInTheDocument();
  });

  it("⚠️ labels an ARTIFACT distinctly — it is neither a match nor a disagreement", async () => {
    // ⚠️ THE FOUR STATES MUST NOT COLLAPSE ON THE SCREEN EITHER. This upload
    // gates on Charlene Li, but it also carries LinkedIn's author block around
    // the Client's own name. Painting that row "author matches" would hide the
    // scraper's behaviour on the one screen showing the raw strings; painting it
    // "author differs" would say the scrape named someone else, which is false.
    renderIt({
      report: {
        clientName: "Eitan Hoenig",
        authors: [
          { postName: WRONG, residue: "Charlene Li", count: 1, verdict: "mismatch" },
          { postName: EITAN, residue: "", count: 4, verdict: "artifact" },
          { postName: "Eitan Hoenig • You", residue: "", count: 2, verdict: "match" },
        ],
        total: 7,
        mismatched: 1,
        decorated: 4,
      },
    });

    expect(screen.getByText("author differs")).toBeInTheDocument();
    expect(screen.getByText("author matches")).toBeInTheDocument();
    expect(screen.getByText("author matches + badge")).toBeInTheDocument();
  });

  it("⚠️ puts the SUBSTRING-TRAP leftover on screen — 'Raj Singhania' minus 'Raj Singh'", async () => {
    // ⚠️ THE ROW THAT MOST NEEDS THE RESIDUE. The raw string `Raj Singhania` and
    // the client name `Raj Singh` look almost identical side by side; without
    // the leftover printed, a reader cannot see WHY this was refused and would
    // reasonably assume the guard is being fussy. `ania` is the whole argument.
    renderIt({
      report: {
        clientName: "Raj Singh",
        authors: [{ postName: "Raj Singhania", residue: "ania", count: 3, verdict: "mismatch" }],
        total: 3,
        mismatched: 3,
        decorated: 0,
      },
    });

    expect(screen.getByText("couldn’t account for: ania")).toBeInTheDocument();
  });

  it("⚠️ puts an UNMAPPED BADGE on screen by name, rather than swallowing it", async () => {
    // Badge vocabulary is evidenced, never guessed: only Premium and Verified
    // are in the known-chrome list. An unknown one fails safe to this screen,
    // and the token itself has to be readable — that is what turns the next new
    // badge into a one-line evidence-driven fix instead of a mystery.
    renderIt({
      report: {
        clientName: "Raj Singh",
        authors: [
          {
            postName: "Raj Singh Raj Singh • You Influencer • You",
            residue: "Influencer",
            count: 60,
            verdict: "mismatch",
          },
        ],
        total: 60,
        mismatched: 60,
        decorated: 0,
      },
    });

    expect(screen.getByText("couldn’t account for: Influencer")).toBeInTheDocument();
  });

  it.each([
    ["pure chrome, nothing but the block", "• You Premium • You"],
    ["a bare badge", "Verified"],
  ])("⚠️ explains a mismatch that left NO residue — %s", async (_case, scraped) => {
    // ⚠️ THE ROWS THAT MOST NEEDED AN EXPLANATION GOT NONE. A mismatch can have
    // an empty residue: these fail the guard because the Client's name was
    // never consumed, NOT because characters were left over. The old condition
    // keyed on the residue alone, so the reader saw `author differs` beside a
    // raw string and nothing whatsoever about why.
    //
    // ⚠️ AND THE REASON IS NAMED IN ITS OWN TERMS. "couldn't account for: …"
    // would be a lie here — there is nothing left over to account for.
    renderIt({
      report: {
        clientName: "Raj Singh",
        authors: [{ postName: scraped, residue: "", count: 2, verdict: "mismatch" }],
        total: 2,
        mismatched: 2,
        decorated: 0,
      },
    });

    expect(screen.getByText("Raj Singh doesn’t appear in this string")).toBeInTheDocument();
    expect(screen.queryByText(/account for/i)).toBeNull();
  });

  it("⚠️ explains it for a row where NOTHING was consumed either", async () => {
    // The other shape of the same fact: the residue equals the raw string, so
    // repeating it would be noise — but the reason still needs saying.
    renderIt({
      report: {
        clientName: "Raj Singh",
        authors: [
          { postName: "Charlene Li", residue: "Charlene Li", count: 1, verdict: "mismatch" },
        ],
        total: 1,
        mismatched: 1,
        decorated: 0,
      },
    });

    expect(screen.getByText("Raj Singh doesn’t appear in this string")).toBeInTheDocument();
  });

  it("⚠️ says NOTHING of the kind for an artifact, or for a row with no author", async () => {
    // The discriminator. An artifact also has an empty residue — but its name
    // WAS found, so "doesn't appear" would be flatly false. And a row carrying
    // no author at all already says so; adding this line would be noise on top.
    renderIt({
      report: {
        clientName: "Raj Singh",
        authors: [
          { postName: RAJ_BLOCK, residue: "", count: 3, verdict: "artifact" },
          { postName: "", residue: "", count: 1, verdict: "mismatch" },
        ],
        total: 4,
        mismatched: 1,
        decorated: 3,
      },
    });

    expect(screen.queryByText(/doesn’t appear in this string/)).toBeNull();
    expect(screen.getByText(/no author name/i)).toBeInTheDocument();
  });

  it("⚠️ shows NO leftover line when there was nothing left over", async () => {
    // The discriminator for the test above: a screen that printed the residue
    // unconditionally would render an empty "couldn't account for:" on every
    // matching row, which reads as a defect rather than as an accounted-for row.
    renderIt({
      report: {
        clientName: "Eitan Hoenig",
        authors: [{ postName: EITAN, residue: "", count: 4, verdict: "artifact" }],
        total: 4,
        mismatched: 0,
        decorated: 4,
      },
    });

    expect(screen.queryByText(/account for/i)).toBeNull();
  });

  it("⚠️ the footer describes the badges it ACCOUNTS FOR, and does not promise more", async () => {
    // ⚠️ THIS PROSE WENT STALE ON 2026-08-20 AND WAS REWRITTEN. It read "A name
    // that repeats itself or carries a badge (“Premium”) is the scraper
    // capturing the whole author block" — which, once Premium and Verified
    // stopped reaching this screen at all, described the one case that can no
    // longer be here. Anything on this screen now carries a badge ArcBase does
    // NOT know, so the footer has to say which ones it does.
    renderIt();

    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Premium and Verified/);
    expect(text).toMatch(/anything left over is shown above/i);
    expect(text).toMatch(/never rewrites a scraped value/i);
  });

  it("⚠️ never offers to rewrite the scraped name to force a match", async () => {
    // ADR 0009 forbids reinterpreting scraped values, and the raw string is the
    // whole diagnostic value of this screen.
    //
    // ⚠️ THE SECOND HALF OF THIS RATIONALE DIED WITH ADR 0010 AND IS NOT REPEATED
    // HERE. It used to add "…which is how a post lands on the wrong client",
    // true only while the name WAS the attribution. Attribution is now the
    // `client_id` FK from the operator's selection, so no rewriting of a scraped
    // name could misattribute anything — the refusal stands on ADR 0009 alone.
    renderIt();

    expect(screen.queryByRole("button", { name: /fix|rename|correct|clean/i })).toBeNull();
  });
});

// ── THE SUMMARY SENTENCE MUST NOT COLLAPSE THREE STATES INTO TWO ─────────────
// The per-row badges have been three-state since the decorated-author-block
// slice. The sentence above them was not: `total - mismatched` swept `decorated`
// in with the plain matches, so a mixed upload read "The other 59 carry a
// matching author name" while the rows one line below correctly said
// "author matches + badge". A summary contradicting its own evidence, on the one
// screen built for diagnosis, is worse than either error alone.

/** Build a report from its three counts; `authors` only needs to be plausible. */
function counted({
  matched = 0,
  decorated = 0,
  mismatched = 0,
  clientName = "Raj Singh",
}: {
  matched?: number;
  decorated?: number;
  mismatched?: number;
  clientName?: string;
}) {
  const authors = [
    mismatched > 0
      ? {
          postName: "Charlene Li • You",
          residue: "Charlene Li",
          count: mismatched,
          verdict: "mismatch" as const,
        }
      : null,
    decorated > 0
      ? {
          postName: `${clientName} ${clientName} • You Verified • You`,
          residue: "",
          count: decorated,
          verdict: "artifact" as const,
        }
      : null,
    matched > 0
      ? { postName: `${clientName} • You`, residue: "", count: matched, verdict: "match" as const }
      : null,
  ].filter((a) => a !== null);

  return {
    clientName,
    authors,
    total: matched + decorated + mismatched,
    mismatched,
    decorated,
  };
}

/**
 * The trailing sentence only — the remainder of the SUMMARY PARAGRAPH after the
 * fixed prose, scoped to that `<p>` so an empty tail really means "no sentence"
 * rather than "the rest of the card". Reached via the `<strong>N of M</strong>`
 * the paragraph opens with.
 */
function tail(): string {
  const paragraph = screen.getByText(/^\d+ of \d+$/).closest("p");
  const text = paragraph?.textContent ?? "";
  const anchor = "upload a different file.";
  return text.slice(text.indexOf(anchor) + anchor.length);
}

describe("NameMismatchConfirm — the trailing count sentence", () => {
  it("⚠️ a MIXED upload does NOT call 59 decorated rows 'a matching author name'", async () => {
    // THE DEFECT, stated as a test. 1 genuine mismatch + 59 decorated blocks.
    renderIt({ report: counted({ mismatched: 1, decorated: 59 }) });

    const text = document.body.textContent ?? "";
    expect(text).toContain("59");
    expect(text).toContain("author block");
    expect(text).not.toContain("matching author name");
  });

  it("⚠️ decorated and plain-matched uploads render DIFFERENT sentences", async () => {
    // The discriminator. If the two states shared a sentence, every assertion
    // above could pass while the collapse survived untouched.
    renderIt({ report: counted({ mismatched: 1, decorated: 59 }) });
    const decoratedTail = tail();

    cleanup();
    renderIt({ report: counted({ mismatched: 1, matched: 59 }) });
    const matchedTail = tail();

    expect(decoratedTail).not.toBe(matchedTail);
    expect(matchedTail).toContain("matching author name");
    expect(decoratedTail).not.toContain("matching author name");
  });

  it("⚠️ a THREE-WAY upload states both non-mismatch counts SEPARATELY", async () => {
    // Neither may be folded into the other, and the three must still add up.
    const report = counted({ mismatched: 1, matched: 2, decorated: 3 });
    expect(report.total).toBe(6);
    renderIt({ report });

    const sentence = tail();
    expect(sentence).toContain("2 carry a matching author name");
    expect(sentence).toContain("3 carry Raj Singh’s name inside LinkedIn’s author block");
    // The arithmetic the sentence implies, pinned independently of the wording.
    expect(report.mismatched + report.decorated + 2).toBe(report.total);
  });

  it("⚠️ the no-decorated case is BYTE-IDENTICAL to the sentence that shipped before", async () => {
    // ⚠️ AN EXACT STRING, NOT A SUBSTRING MATCH. The common path — a mismatch
    // beside ordinary matches — must be provably untouched by this change.
    renderIt({ report: counted({ mismatched: 2, matched: 3, clientName: "Eitan Hoenig" }) });

    expect(document.body.textContent).toContain(" The other 3 carry a matching author name.");
  });

  it("⚠️ reads grammatically at N = 1 in the plain-matched branch too", async () => {
    // ⚠️ THE LAST BRANCH TO GET `carry()`, AND IT GOT IT LAST FOR A REASON. The
    // slice that split this sentence was required to keep this branch
    // byte-identical to the copy that shipped before it — and that copy already
    // used the plural verb for a single row. Byte-identity and N = 1 grammar
    // contradicted each other, so the conflict was surfaced rather than
    // silently resolved. Resolved here, in the other direction: `carry()`
    // leaves every N ≠ 1 rendering untouched, so the exact-string pin above
    // still passes unedited.
    //
    // ⚠️ THE OLD RENDERING IS DELIBERATELY NOT QUOTED ANYWHERE, HERE INCLUDED.
    // Asserting it — or even naming it in prose a grep will find — makes a
    // known-bad string look load-bearing to whoever reads it next.
    //
    // Reachable, and built from real rows: one genuine mismatch, one plain
    // match, nothing decorated.
    renderIt({ report: counted({ mismatched: 1, matched: 1 }) });

    expect(tail()).toBe(" The other one carries a matching author name.");
  });

  it("⚠️ an ALL-MISMATCH upload gets no trailing sentence at all", async () => {
    renderIt({ report: counted({ mismatched: 4 }) });

    expect(tail().trim()).toBe("");
  });

  it("⚠️ reads grammatically at N = 1 in the decorated branch", async () => {
    renderIt({ report: counted({ mismatched: 1, decorated: 1 }) });

    const sentence = tail();
    expect(sentence).toContain("one carries Raj Singh’s name inside LinkedIn’s author block");
    expect(sentence).not.toMatch(/\b1 carry\b/);
  });

  it("⚠️ reads grammatically at N = 1 in BOTH halves of the three-way branch", async () => {
    renderIt({ report: counted({ mismatched: 1, matched: 1, decorated: 1 }) });

    const sentence = tail();
    expect(sentence).toContain("one carries a matching author name");
    expect(sentence).toContain("one carries Raj Singh’s name inside LinkedIn’s author block");
    expect(sentence).not.toMatch(/\b1 carry\b/);
  });

  it("⚠️ every row still carries its OWN verdict label, unchanged", async () => {
    // The sentence and the rows must agree — that agreement is the whole point.
    renderIt({ report: counted({ mismatched: 1, matched: 2, decorated: 3 }) });

    expect(screen.getByText("author differs")).toBeInTheDocument();
    expect(screen.getByText("author matches")).toBeInTheDocument();
    expect(screen.getByText("author matches + badge")).toBeInTheDocument();
  });

  it("⚠️ the HEADING is untouched and still correct in every mix", async () => {
    // `mismatched === total` cannot be true while any decorated row exists, so
    // the "isn't <client>" heading stays confined to the all-mismatch case.
    renderIt({ report: counted({ mismatched: 4 }) });
    expect(screen.getByRole("heading").textContent).toBe(
      "The author on these posts isn't Raj Singh",
    );

    cleanup();
    renderIt({ report: counted({ mismatched: 1, decorated: 59 }) });
    expect(screen.getByRole("heading").textContent).toBe(
      "Some of these posts have a different author",
    );
  });
});
