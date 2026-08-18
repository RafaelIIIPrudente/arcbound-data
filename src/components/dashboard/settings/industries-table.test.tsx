import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Industry } from "@/services/types";

import { IndustriesTable, IndustryRowView, IndustriesTableView } from "./industries-table";

const SAAS: Industry = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "SaaS",
  status: "active",
};

const RETIRED: Industry = {
  id: "22222222-2222-2222-2222-222222222222",
  name: "Fax Machines",
  status: "archived",
};

const noop = () => {};
const baseProps = {
  state: { status: "idle" as const },
  renameAction: noop,
  statusAction: noop,
  deleteAction: noop,
  pending: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THE FOUR SITUATIONS THAT MUST NEVER LOOK ALIKE.
//
// An empty registry, a failed read, a refused delete and an archived row are
// four different facts. This whole file exists because they are cheap to
// collapse: one `{rows.length === 0 && …}` and the first two become the same
// sentence, and the screen tells an admin the registry is empty at the moment it
// might be full and unreachable — inviting them to recreate rows that exist.
// ─────────────────────────────────────────────────────────────────────────────

describe("IndustriesTableView — empty is not the same as broken", () => {
  it("⚠️ distinguishes 'none yet' from 'could not be read'", () => {
    // ⚠️ THE TEST THE BRIEF CALLS THE ONE THAT MATTERS MOST, and the registry is
    // EMPTY IN PRODUCTION RIGHT NOW — by decision, because which industries
    // Arcbound recognises is still open. So the empty state is not a rare edge:
    // it is the first thing anybody sees. If it reads as a fault, the feature's
    // first impression is a bug report.
    const { rerender } = render(
      <IndustriesTableView registry={{ status: "ok", industries: [] }} />,
    );
    const empty = screen.getByRole("status").textContent ?? "";
    expect(empty).toMatch(/none yet|no industries/i);

    rerender(<IndustriesTableView registry={{ status: "unavailable" }} />);
    const broken = screen.getByRole("alert").textContent ?? "";
    expect(broken).toMatch(/could not be read/i);

    // Not merely different ARIA roles — different words. A screen reader user
    // hearing "alert" and a sighted user reading the sentence must both be able
    // to tell which of the two happened.
    expect(broken).not.toEqual(empty);
    expect(broken).not.toMatch(/none yet|no industries/i);
  });

  it("⚠️ invites the first industry rather than reporting a fault", () => {
    render(<IndustriesTableView registry={{ status: "ok", industries: [] }} />);

    const empty = screen.getByRole("status").textContent ?? "";
    // An empty registry is a true statement about Arcbound, so the copy must not
    // borrow the vocabulary of failure.
    expect(empty).not.toMatch(/error|failed|could not|unavailable|problem/i);
    expect(empty).toMatch(/add/i);
  });

  it("⚠️ warns against adding while the read is broken", () => {
    render(<IndustriesTableView registry={{ status: "unavailable" }} />);

    // The actionable half: names are unique case-insensitively in the database,
    // so an admin who assumes "empty" and starts typing gets constraint errors
    // on rows that already exist.
    expect(screen.getByRole("alert").textContent).toMatch(/duplicat|until it loads/i);
  });

  it("lists the registry when it reads", () => {
    render(<IndustriesTableView registry={{ status: "ok", industries: [SAAS, RETIRED] }} />);

    expect(screen.getByText("SaaS")).toBeInTheDocument();
    expect(screen.getByText("Fax Machines")).toBeInTheDocument();
  });
});

describe("IndustryRowView — archive is reversible, delete is not", () => {
  it("⚠️ does not present Archive and Delete as the same kind of act", () => {
    // ⚠️ TWO IDENTICAL-LOOKING BUTTONS ARE THE DEFECT HERE. `set_industry_status`
    // is the reversible retirement path and `delete_industry` is a typo eraser;
    // an admin who cannot tell them apart at a glance will eventually reach for
    // the wrong one, and only one of the two can be undone.
    render(<IndustryRowView industry={SAAS} {...baseProps} />);

    const archive = screen.getByRole("button", { name: /archive/i });
    const del = screen.getByRole("button", { name: /delete/i });

    // Different words, different emphasis, and the reversibility is stated in
    // the copy rather than left to the reader's memory.
    expect(archive).not.toEqual(del);
    expect(screen.getByText(/restore it later|can be restored/i)).toBeInTheDocument();
    expect(screen.getByText(/permanent|cannot be undone/i)).toBeInTheDocument();
  });

  it("⚠️ makes Delete cost a second click, and Archive not", () => {
    // Friction scaled to blast radius, the same rule the Services screen keeps:
    // archiving breaks nothing (a Client already recorded in an archived
    // industry still reads it — S2 proves that), so it submits directly.
    // Deleting cannot be undone, so it asks.
    render(<IndustryRowView industry={SAAS} {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    const panel = screen.getByRole("group", { name: /delete saas/i });
    expect(within(panel).getByRole("button", { name: /delete saas/i })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("marks an archived row as retired and offers Restore instead of Archive", () => {
    render(<IndustryRowView industry={RETIRED} {...baseProps} />);

    expect(screen.getByText(/archived/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /restore/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^archive$/i })).toBeNull();
  });

  it("⚠️ says an archived industry still shows on the Clients already in it", () => {
    // Archiving is not deletion and does not evict anyone. Saying so is what
    // makes "reversible" mean something concrete rather than reassuring.
    render(<IndustryRowView industry={RETIRED} {...baseProps} />);

    expect(screen.getByText(/clients already in it still show it/i)).toBeInTheDocument();
    // And it says it is no longer offered — the other half of what archiving did.
    expect(screen.getByText(/not offered for new clients/i)).toBeInTheDocument();
  });

  it("offers rename as an uncontrolled field carrying the current name", () => {
    render(<IndustryRowView industry={SAAS} {...baseProps} />);

    const field = screen.getByLabelText(/rename saas/i) as HTMLInputElement;
    expect(field.defaultValue).toBe("SaaS");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ⚠️ THE REFUSAL.
  // ───────────────────────────────────────────────────────────────────────────
  it("⚠️ shows the DATABASE'S OWN refusal, count and all", () => {
    // ⚠️ THE NUMBER IS THE WHOLE POINT. `delete_industry` raises
    //   'cannot delete: 3 client(s) are still recorded in this industry'
    // and that count is the only thing telling an admin what to do next.
    // "Cannot delete" on its own says nothing — three clients is a morning's
    // work, thirty is a decision. This screen re-implements no database rule; it
    // asks, and repeats the answer verbatim.
    const refusal = "cannot delete: 3 client(s) are still recorded in this industry";
    render(
      <IndustryRowView
        industry={SAAS}
        {...baseProps}
        state={{ status: "error", message: refusal }}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(refusal);
    // Asserted on the NUMBER reaching the screen, not merely on some error
    // appearing: a generic "Cannot delete" would satisfy a laxer assertion while
    // destroying the only useful part of the message.
    expect(alert.textContent).toMatch(/\b3\b/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A SCREEN MUST NOT OFFER THE ACTION IT IS WARNING AGAINST.
//
// When the registry read fails the screen says, correctly, "do not add
// industries until it loads, or you may create duplicates" — and then rendered a
// working add form directly above that sentence. The warning is the right
// warning; leaving the control live turns it into a caption on a trap.
// ─────────────────────────────────────────────────────────────────────────────

describe("IndustriesTable — an unreadable registry withdraws the add form", () => {
  it("⚠️ does not render the add form while it is telling you not to add", () => {
    render(<IndustriesTable registry={{ status: "unavailable" }} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/do not add industries/i);
    expect(screen.queryByRole("button", { name: /add industry/i })).toBeNull();
    expect(screen.queryByLabelText(/industry name/i)).toBeNull();
  });

  it("renders the add form when the registry read succeeded, empty or not", () => {
    // ⚠️ AN EMPTY REGISTRY IS THE OPPOSITE CASE — it is exactly when adding is
    // the thing to do, and it is what production looks like today.
    const { unmount } = render(<IndustriesTable registry={{ status: "ok", industries: [] }} />);
    expect(screen.getByRole("button", { name: /add industry/i })).toBeInTheDocument();
    unmount();

    render(<IndustriesTable registry={{ status: "ok", industries: [SAAS] }} />);
    expect(screen.getByRole("button", { name: /add industry/i })).toBeInTheDocument();
  });
});
