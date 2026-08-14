import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ArcboundService } from "@/services/types";

import { ClientServicesCardView } from "./client-services-card";

const CLIENT = "11111111-1111-1111-1111-111111111111";

const LINKEDIN: ArcboundService = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  slug: "linkedin-growth",
  name: "LinkedIn Growth",
  description: null,
  handler: "linkedin_post_metrics",
  status: "active",
  sortOrder: 10,
};
const OUTREACH: ArcboundService = {
  id: "aaaaaaaa-0000-0000-0000-000000000002",
  slug: "outreach-system",
  name: "Outreach System",
  description: null,
  handler: "outreach_prospects",
  status: "active",
  sortOrder: 20,
};
/** A listed offering with no pipeline — a real state, not a gap. */
const ADVISORY: ArcboundService = {
  id: "aaaaaaaa-0000-0000-0000-000000000003",
  slug: "advisory",
  name: "Advisory",
  description: null,
  handler: null,
  status: "active",
  sortOrder: 30,
};
/** Retired in S2. Still held by some Clients, and their history must survive. */
const LEGACY_ARCHIVED: ArcboundService = {
  id: "aaaaaaaa-0000-0000-0000-000000000004",
  slug: "legacy-audit",
  name: "Legacy Audit",
  description: null,
  handler: null,
  status: "archived",
  sortOrder: 40,
};

const ALL = [LINKEDIN, OUTREACH, ADVISORY, LEGACY_ARCHIVED];

const noop = () => {};
const baseProps = {
  clientId: CLIENT,
  services: ALL,
  state: { status: "idle" as const },
  formAction: noop,
  pending: false,
  isAdmin: true,
};

/**
 * Exactly what the browser would put in the POST body: every checked input named
 * `service_id`. This is the submitted set, read off the DOM rather than inferred.
 */
function submittedIds(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLInputElement>('input[name="service_id"]'))
    .filter((input) => input.checked)
    .map((input) => input.value);
}

describe("⚠️ the replace-the-whole-set trap", () => {
  it("⚠️ KEEPS an archived Service the Client holds when an unrelated change is saved", () => {
    // ⚠️ THE TEST THIS SLICE EXISTS FOR.
    //
    // `setClientServices` REPLACES the entire set — it is not a delta. So the form
    // must submit the COMPLETE intended state, not just the rows it happens to
    // render as normal checkboxes. A Client holds `Legacy Audit`, which S2 has
    // since archived. If the form offered only ACTIVE Services, then ticking an
    // unrelated box and saving would submit {LinkedIn, Outreach} — and the archived
    // assignment would be deleted. Silently: no error, no trace, and the archive
    // design exists precisely so that history survives.
    //
    // The assertion is on the submitted set, not on what is visible, because
    // "rendered somewhere on the card" is not the same as "will be posted".
    const { container } = render(
      <ClientServicesCardView {...baseProps} assignedIds={[OUTREACH.id, LEGACY_ARCHIVED.id]} />,
    );

    // Before touching anything, the current state round-trips intact.
    expect(submittedIds(container).sort()).toEqual([OUTREACH.id, LEGACY_ARCHIVED.id].sort());

    // An unrelated change: also give them LinkedIn Growth.
    fireEvent.click(screen.getByRole("checkbox", { name: /linkedin growth/i }));

    // The archived Service is STILL in the set that would be posted.
    expect(submittedIds(container)).toContain(LEGACY_ARCHIVED.id);
    expect(submittedIds(container).sort()).toEqual(
      [LINKEDIN.id, OUTREACH.id, LEGACY_ARCHIVED.id].sort(),
    );
  });

  it("shows the held archived Service, and says it is archived", () => {
    render(<ClientServicesCardView {...baseProps} assignedIds={[LEGACY_ARCHIVED.id]} />);

    expect(screen.getByRole("checkbox", { name: /legacy audit/i })).toBeChecked();
    expect(screen.getByText(/archived/i)).toBeInTheDocument();
  });

  it("⚠️ does NOT offer an archived Service the Client does not hold", () => {
    // ⚠️ ARCHIVED MEANS RETIRED. Surviving on a Client that already had it is
    // history; being assignable to a new one would be resurrecting it through a
    // side door, and would defeat the point of archiving in S2.
    render(<ClientServicesCardView {...baseProps} assignedIds={[LINKEDIN.id]} />);

    expect(screen.queryByRole("checkbox", { name: /legacy audit/i })).toBeNull();
  });

  it("an admin can still deliberately remove a held archived Service", () => {
    // Keeping it by default is the protection; making it permanent would be a
    // different bug — an assignment nobody could ever undo.
    const { container } = render(
      <ClientServicesCardView {...baseProps} assignedIds={[LEGACY_ARCHIVED.id]} />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /legacy audit/i }));

    expect(submittedIds(container)).toEqual([]);
  });
});

describe("ClientServicesCardView — what it says", () => {
  it("⚠️ states that a Client with no Services cannot receive uploads", () => {
    // ⚠️ A REAL, VALID STATE — not an empty box and not an error. Once /upload
    // filters by Services (S4), this Client has no upload path at all, and the
    // card is the only place that fact is visible.
    render(<ClientServicesCardView {...baseProps} assignedIds={[]} />);

    expect(screen.getByText(/no services assigned/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot receive uploads/i)).toBeInTheDocument();
  });

  it("names the pipeline, and says 'No data pipeline' rather than an em dash", () => {
    // Em dash is this codebase's marker for "could not be read" — a Service with no
    // handler is a deliberate listing, not a failed lookup.
    //
    // ⚠️ SCOPED TO THE SERVICE ROW, NOT THE WHOLE CARD, AND THAT IS NOT A LOOPHOLE.
    // Every card in this codebase opens with a decorative "—" bullet beside its
    // section title (see report-link-card, services-table). Asserting over the
    // whole container would fail on that shared design element while proving
    // nothing about the data. What matters is that no VALUE renders as an em dash.
    render(
      <ClientServicesCardView {...baseProps} services={[ADVISORY]} assignedIds={[ADVISORY.id]} />,
    );

    expect(screen.getByText(/no data pipeline/i)).toBeInTheDocument();

    const row = screen.getByText(/advisory/i).closest("label");
    expect(row?.textContent).toContain("No data pipeline");
    expect(row?.textContent).not.toContain("—");
  });

  it("surfaces the database's refusal verbatim", () => {
    render(
      <ClientServicesCardView
        {...baseProps}
        assignedIds={[]}
        state={{ status: "error", message: "unknown client 1234" }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("unknown client 1234");
  });
});

describe("ClientServicesCardView — an analyst", () => {
  it("⚠️ sees the assignment but no way to change it", () => {
    // ⚠️ READ SURVIVES, WRITE DOES NOT (ADR 0013). An analyst must still be able to
    // see which Services a Client receives — that is information, not authority.
    render(
      <ClientServicesCardView
        {...baseProps}
        isAdmin={false}
        assignedIds={[LINKEDIN.id, LEGACY_ARCHIVED.id]}
      />,
    );

    expect(screen.getByText(/linkedin growth/i)).toBeInTheDocument();
    // The archived one is part of the truth about this Client, so it stays visible.
    expect(screen.getByText(/legacy audit/i)).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("still learns that a Client has no Services", () => {
    render(<ClientServicesCardView {...baseProps} isAdmin={false} assignedIds={[]} />);

    expect(screen.getByText(/no services assigned/i)).toBeInTheDocument();
  });
});

describe("⚠️ isAdmin is REQUIRED, and that is a source guard on purpose", () => {
  // ⚠️ NO RUNTIME TEST CAN CATCH THIS, WHICH IS WHY IT IS A SOURCE ASSERTION.
  //
  // Requiredness is a COMPILE-TIME property. Every test here passes `isAdmin`
  // explicitly, so making the prop optional with a default of `true` changes
  // nothing any of them can observe — the suite stays green while the safety
  // disappears. The danger is a FUTURE call site that forgets the prop and
  // silently inherits the permissive answer, handing an analyst the admin form.
  //
  // `ReportLinkCard` on this same page carries the identical rule. The guard below
  // is the same instrument this repo uses for `getRole`'s React `cache()`.
  const MODULE = "src/components/dashboard/client/client-services-card.tsx";
  const source = readFileSync(join(process.cwd(), MODULE), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("declares isAdmin as required, never optional", () => {
    expect(code).toMatch(/isAdmin:\s*boolean;/);
    expect(code).not.toMatch(/isAdmin\?\s*:/);
  });

  it("never defaults isAdmin in the destructuring", () => {
    // `isAdmin = true` would be the permissive default in all but name.
    //
    // The negative lookahead excludes `isAdmin={isAdmin}` — that is the connected
    // component PASSING the prop down, not defaulting it. Without it this assertion
    // fails on correct code, which is exactly what it did when first written.
    expect(code).not.toMatch(/isAdmin\s*=\s*(?!\{)/);
  });

  it("strips comments without stripping the code it is checking", () => {
    // Guard the guard: proves the stripping left real code behind rather than
    // emptying the file and passing vacuously.
    expect(code).toContain("ClientServicesCardView");
    expect(code).not.toContain("REQUIRED, AND DELIBERATELY NOT DEFAULTED");
  });
});

describe("the form posts the client id alongside the set", () => {
  it("carries the client id so the action knows whose set this is", () => {
    const { container } = render(
      <ClientServicesCardView {...baseProps} assignedIds={[LINKEDIN.id]} />,
    );

    const clientField = container.querySelector<HTMLInputElement>('input[name="client_id"]');
    expect(clientField?.value).toBe(CLIENT);
  });

  it("calls the action on submit", () => {
    const formAction = vi.fn();
    const { container } = render(
      <ClientServicesCardView {...baseProps} assignedIds={[LINKEDIN.id]} formAction={formAction} />,
    );

    fireEvent.submit(container.querySelector("form")!);

    expect(formAction).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THE BUTTON MUST NOT LIE ABOUT WHETHER THERE IS ANYTHING TO SAVE.
//
// The card used to read "Saved. 2 services assigned." with a fully enabled Save
// button directly beneath it. Both statements were live at once, so a user could
// not tell persisted from pending — and the safe move was to press Save again.
// A control that trains people to press it when it does nothing is one they will
// ignore on the day it matters.
//
// ⚠️ DIRTINESS IS TRACKED WITHOUT CONTROLLING THE INPUTS. The checkboxes stay
// `defaultChecked`, because `setClientServices` REPLACES the whole set and the
// browser submitting exactly what is ticked is what carries a held-but-archived
// Service through an unrelated save. The tests below therefore drive real DOM
// clicks and read the submitted set off the DOM, never off React state.
// ─────────────────────────────────────────────────────────────────────────────

describe("⚠️ the Save button reflects whether there is anything to save", () => {
  const saveButton = () => screen.getByRole("button", { name: /save services/i });

  it("is DISABLED on first render — the ticked set already is the saved set", () => {
    render(<ClientServicesCardView {...baseProps} assignedIds={[LINKEDIN.id, OUTREACH.id]} />);

    expect(saveButton()).toBeDisabled();
  });

  it("ENABLES when a box is ticked", () => {
    render(<ClientServicesCardView {...baseProps} assignedIds={[LINKEDIN.id]} />);

    fireEvent.click(screen.getByRole("checkbox", { name: /outreach system/i }));

    expect(saveButton()).toBeEnabled();
  });

  it("⚠️ DISABLES again when the selection returns to the saved set", () => {
    // ⚠️ THE ONE A LATCHING IMPLEMENTATION FAILS. "Has the user touched anything?"
    // is a different question from "is the selection different?", and only the
    // second one is worth putting on a button.
    render(<ClientServicesCardView {...baseProps} assignedIds={[LINKEDIN.id]} />);
    const outreach = screen.getByRole("checkbox", { name: /outreach system/i });

    fireEvent.click(outreach);
    expect(saveButton()).toBeEnabled();

    fireEvent.click(outreach);
    expect(saveButton()).toBeDisabled();
  });

  it("⚠️ ENABLES when everything is deselected — that is a real change, not an empty form", () => {
    // ⚠️ "NOTHING TICKED" IS NOT "NOTHING TO DO". Removing a Client's last Service
    // is a legitimate admin action, and blocking it would be a different defect
    // wearing the same fix.
    const { container } = render(
      <ClientServicesCardView {...baseProps} assignedIds={[LINKEDIN.id]} />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /linkedin growth/i }));

    expect(submittedIds(container)).toEqual([]);
    expect(saveButton()).toBeEnabled();
  });

  it("⚠️ DISABLES after a successful save — the baseline moves to what was saved", () => {
    // ⚠️ IF THE BASELINE STAYED AT THE ORIGINALLY-RENDERED SET, the button would
    // re-enable permanently after the first save and the bug would be rebuilt one
    // layer up. Proven by mutation, not by inspection.
    const { rerender } = render(
      <ClientServicesCardView {...baseProps} assignedIds={[LINKEDIN.id]} />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /outreach system/i }));
    expect(saveButton()).toBeEnabled();

    rerender(
      <ClientServicesCardView
        {...baseProps}
        assignedIds={[LINKEDIN.id]}
        state={{ status: "saved", message: "Saved. 2 services assigned." }}
      />,
    );

    expect(saveButton()).toBeDisabled();
  });

  it("⚠️ never shows “Saved.” beside an enabled Save button", () => {
    // ⚠️ THE CONTRADICTION THAT STARTED THIS. A success message is a claim about
    // the CURRENT selection; the moment the selection moves on, the claim is false
    // and must go — in both directions.
    //
    // ⚠️ ONE STATE OBJECT, REUSED ACROSS BOTH RENDERS, AND THAT IS THE FAITHFUL
    // MODEL. `useActionState` returns a NEW object only when an action completes,
    // and the SAME one across every ordinary re-render. Passing a fresh literal on
    // the second render would be simulating a SECOND SAVE — after which
    // re-baselining and showing "Saved." again is the correct behaviour, not a bug.
    // The card distinguishes those two cases by object identity, so the test has to
    // as well.
    const SAVED = { status: "saved", message: "Saved. 1 service assigned." } as const;
    const { rerender } = render(
      <ClientServicesCardView {...baseProps} assignedIds={[LINKEDIN.id]} state={SAVED} />,
    );

    // Freshly saved: message shown, nothing to do.
    expect(screen.getByRole("status")).toHaveTextContent(/saved/i);
    expect(saveButton()).toBeDisabled();

    // The user ticks something new — the message is now a lie and must vanish.
    fireEvent.click(screen.getByRole("checkbox", { name: /advisory/i }));

    expect(saveButton()).toBeEnabled();
    expect(screen.queryByRole("status")).toBeNull();

    // And it must not come back merely because the parent re-rendered.
    rerender(<ClientServicesCardView {...baseProps} assignedIds={[LINKEDIN.id]} state={SAVED} />);

    expect(screen.queryByRole("status")).toBeNull();
    expect(saveButton()).toBeEnabled();
  });

  it("⚠️ keeps a held ARCHIVED Service ticked and submitted while tracking dirtiness", () => {
    // ⚠️ THE CONSTRAINT THIS FIX HAD TO RESPECT. Dirtiness tracking must not take
    // ownership of the input values: the archived Service is ticked by the browser,
    // not by React, and it must still ride along in the POST body.
    const { container } = render(
      <ClientServicesCardView {...baseProps} assignedIds={[OUTREACH.id, LEGACY_ARCHIVED.id]} />,
    );

    expect(screen.getByRole("checkbox", { name: /legacy audit/i })).toBeChecked();
    expect(saveButton()).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: /linkedin growth/i }));

    expect(saveButton()).toBeEnabled();
    expect(submittedIds(container)).toContain(LEGACY_ARCHIVED.id);
  });

  it("stays disabled while a save is in flight, and says so", () => {
    render(<ClientServicesCardView {...baseProps} assignedIds={[LINKEDIN.id]} pending />);

    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
  });
});
