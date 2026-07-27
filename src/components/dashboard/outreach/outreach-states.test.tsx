import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OutreachNoSnapshot, OutreachTruncated, OutreachUnavailable } from "./outreach-states";

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THREE READ STATES THAT MUST NEVER COLLAPSE INTO TWO.
//
//   • unavailable — the read broke. We know NOTHING. Figures are meaningless.
//   • no snapshot — the read worked; this Client has never had an upload.
//   • truncated   — the read worked but stopped short. Figures are REAL BUT LOW.
//
// A reader shown the wrong one of these either distrusts good numbers or trusts
// short ones. The single worst outcome — rendering a failed read as "0
// prospects" — is asserted against directly below.
// ─────────────────────────────────────────────────────────────────────────────

describe("OutreachUnavailable", () => {
  it("says the data could NOT BE READ", () => {
    render(<OutreachUnavailable />);

    // Heading and body are asserted separately: a single loose regex matched
    // both and passed while telling us nothing about either.
    expect(screen.getByText("Outreach unavailable")).toBeInTheDocument();
    expect(screen.getByText(/couldn’t read/i)).toBeInTheDocument();
  });

  it("NEVER shows a zero, and never claims there are no prospects", () => {
    // ⚠️ THE MUTATION THIS EXISTS TO CATCH. A broken read rendered as "0
    // prospects" is a confident lie: it asserts a fact nobody measured, and it
    // looks exactly like a Client whose outreach has not started.
    const { container } = render(<OutreachUnavailable />);

    expect(container.textContent).not.toMatch(/\b0\b/);
    expect(container.textContent).not.toMatch(/no prospects/i);
  });

  it("leaks no raw error detail to a staff screen", () => {
    const { container } = render(<OutreachUnavailable />);

    expect(container.textContent).not.toMatch(/error|exception|stack|permission denied/i);
  });
});

describe("OutreachNoSnapshot", () => {
  it("says no snapshot has been uploaded — a real answer, not a failure", () => {
    render(<OutreachNoSnapshot />);

    expect(
      screen.getByText(/no outreach (snapshot|data)|nothing uploaded yet/i),
    ).toBeInTheDocument();
  });

  it("points at where an upload happens", () => {
    render(<OutreachNoSnapshot />);

    expect(screen.getByRole("link")).toHaveAttribute("href", "/upload");
  });

  it("reads DIFFERENTLY from the unavailable state, in SUBSTANCE", () => {
    // ⚠️ THIS USED TO BE `expect(a.textContent).not.toBe(b.textContent)`, which
    // any single character satisfies: pasting the broken-read copy in here with a
    // trailing full stop passed it while telling a client who has simply never
    // uploaded that the read failed. The two panels must differ in what they
    // CLAIM, so each is checked for the other's language.
    const { container: broken } = render(<OutreachUnavailable />);
    const { container: never } = render(<OutreachNoSnapshot />);

    // The failure panel must not suggest an absence of data...
    expect(broken.textContent).toMatch(/couldn’t read/i);
    expect(broken.textContent).not.toMatch(/nothing has been uploaded|no outreach snapshot/i);

    // ...and the never-uploaded panel must not suggest a failure.
    expect(never.textContent).toMatch(/nothing has been uploaded/i);
    expect(never.textContent).not.toMatch(/couldn’t|could not|try again|access is restored/i);
  });
});

describe("OutreachTruncated", () => {
  it("names BOTH numbers, so the size of the gap is visible", () => {
    // ⚠️ "Showing part of this snapshot" alone cannot tell a reader whether they
    // are missing 1 prospect or 87,000 of them — and the pager knew the total
    // all along.
    render(<OutreachTruncated read={50000} total={137412} />);

    expect(screen.getByText(/50,000/)).toBeInTheDocument();
    expect(screen.getByText(/137,412/)).toBeInTheDocument();
  });

  it("says the figures below are LOWER BOUNDS", () => {
    render(<OutreachTruncated read={50000} total={137412} />);

    expect(screen.getByText(/lower bound/i)).toBeInTheDocument();
  });

  it("stays honest when the total is UNKNOWN — no invented number", () => {
    // `total: null` means "not known", never 0.
    const { container } = render(<OutreachTruncated read={50000} total={null} />);

    expect(screen.getByText(/50,000/)).toBeInTheDocument();
    expect(container.textContent).toMatch(/could not establish|how many more/i);
    expect(container.textContent).not.toMatch(/of 0\b/);
  });
});
