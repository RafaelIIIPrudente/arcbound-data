import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { paths } from "@/paths";
import type { ArcboundService } from "@/services/types";

import { ClientServicesPromptView } from "./client-services-prompt";

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
/** Retired in S2. This Client holds nothing, so there is no history to protect. */
const LEGACY_ARCHIVED: ArcboundService = {
  id: "aaaaaaaa-0000-0000-0000-000000000004",
  slug: "legacy-audit",
  name: "Legacy Audit",
  description: null,
  handler: null,
  status: "archived",
  sortOrder: 40,
};

const noop = () => {};
const baseProps = {
  clientId: CLIENT,
  clientName: "Ada Lovelace",
  services: [LINKEDIN, LEGACY_ARCHIVED],
  state: { status: "idle" as const },
  formAction: noop,
  pending: false,
  isAdmin: true,
};

describe("⚠️ an ANALYST is never offered the assign form", () => {
  it("⚠️ THE TEST THIS SLICE IS JUDGED ON: no assign control of any kind", () => {
    // ⚠️ SHOWING THIS FORM TO AN ANALYST WOULD EJECT THEM FROM /upload MID-ROUTINE.
    //
    // `/upload` is NOT admin-gated — a Data Analyst reaches it and uploads, every
    // week. `setClientServicesAction` opens with `requireAdmin()`, which denies by
    // calling `redirect()` — it DENIES BY THROWING. So an analyst who clicked an
    // assign button here would not get an error message they could read and
    // recover from; they would be thrown off the upload page entirely, mid-task,
    // with no explanation and no way back to where they were.
    //
    // Every possible control is asserted absent, not just the obvious one: a
    // checkbox, a submit, and the form element itself. Any one of them surviving
    // is the redirect waiting to happen.
    const { container } = render(<ClientServicesPromptView {...baseProps} isAdmin={false} />);

    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
  });

  it("still states the FACT, so the analyst knows why there are no tabs", () => {
    // The point is not to hide the situation from them — it is to hide a control
    // that would hurt them. They still need to know why their upload tabs vanished.
    render(<ClientServicesPromptView {...baseProps} isAdmin={false} />);

    expect(screen.getByText(/no services assigned/i)).toBeInTheDocument();
  });

  it("gives them the route to a fix, pointing at the client's overview", () => {
    // A dead end would be as bad as a redirect: they must be able to tell someone
    // exactly what needs doing and where.
    render(<ClientServicesPromptView {...baseProps} isAdmin={false} />);

    expect(screen.getByText(/an admin can assign/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /overview/i })).toHaveAttribute(
      "href",
      paths.clients.details(CLIENT),
    );
  });
});

describe("an ADMIN can assign in place", () => {
  it("offers the active services and a save control", () => {
    render(<ClientServicesPromptView {...baseProps} />);

    expect(screen.getByRole("checkbox", { name: /linkedin growth/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /assign/i })).toBeInTheDocument();
  });

  it("⚠️ never offers an ARCHIVED service — this Client holds none to protect", () => {
    // ⚠️ ARCHIVED MEANS RETIRED. The Client Overview shows a HELD archived Service
    // so an unrelated save cannot drop it; here the Client holds nothing at all, so
    // there is no history to preserve and offering one would assign a retired
    // offering afresh.
    render(<ClientServicesPromptView {...baseProps} />);

    expect(screen.queryByRole("checkbox", { name: /legacy audit/i })).toBeNull();
  });

  it("carries the client id so the action knows whose set this is", () => {
    const { container } = render(<ClientServicesPromptView {...baseProps} />);

    expect(container.querySelector<HTMLInputElement>('input[name="client_id"]')?.value).toBe(
      CLIENT,
    );
  });

  it("surfaces the action's refusal verbatim", () => {
    render(
      <ClientServicesPromptView
        {...baseProps}
        state={{ status: "error", message: "admin role required" }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("admin role required");
  });

  it("says so when the registry holds no assignable services at all", () => {
    // Not an empty checkbox list: an admin needs to know the fix is in Settings.
    render(<ClientServicesPromptView {...baseProps} services={[]} />);

    expect(screen.getByText(/no services are registered/i)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});

describe("⚠️ isAdmin is REQUIRED, and that is a source guard on purpose", () => {
  // ⚠️ NO RUNTIME TEST CAN CATCH THIS — every test above passes `isAdmin`
  // explicitly, so an optional prop defaulting to `true` would leave the whole
  // suite green while handing analysts the redirect. Same instrument, and the same
  // reasoning, as `client-services-card.tsx` carries.
  const MODULE = "src/components/dashboard/ingest/client-services-prompt.tsx";
  const source = readFileSync(join(process.cwd(), MODULE), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("declares isAdmin as required, never optional", () => {
    expect(code).toMatch(/isAdmin:\s*boolean;/);
    expect(code).not.toMatch(/isAdmin\?\s*:/);
  });

  it("never defaults isAdmin in the destructuring", () => {
    // The lookahead excludes `isAdmin={isAdmin}` — passing the prop down is not
    // defaulting it.
    expect(code).not.toMatch(/isAdmin\s*=\s*(?!\{)/);
  });

  it("strips comments without stripping the code it is checking", () => {
    expect(code).toContain("ClientServicesPromptView");
    expect(code).not.toContain("EJECT THEM FROM");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THE ASSIGN BUTTON MUST NOT LIE ABOUT WHETHER THERE IS ANYTHING TO ASSIGN.
//
// The same defect the Client Overview card carried: a live success message beside
// a fully enabled submit, so a user cannot tell persisted from pending and the
// safe move is to press it again.
//
// ⚠️ THE RULE IS IDENTICAL TO THE CARD'S; THE BASELINE IS NOT, AND THAT IS THE
// WHOLE DIFFERENCE. Both disable when the ticked set equals the SAVED set. On the
// Overview the saved set can be non-empty, so deselecting everything is a real
// change and must stay enabled. Here the Client holds NOTHING by definition — this
// is the no-Services branch — so the saved set is empty, and "nothing ticked"
// really is "nothing to do". Submitting an empty set here would assign nothing to
// a Client that already has nothing.
//
// ⚠️ SO DO NOT "ALIGN" THE TWO BY MAKING EMPTY SUBMITTABLE HERE. That is not
// consistency, it is a no-op round trip through an admin-only action.
// ─────────────────────────────────────────────────────────────────────────────

describe("⚠️ the Assign button reflects whether there is anything to assign", () => {
  const assignButton = () => screen.getByRole("button", { name: /assign services/i });

  it("is DISABLED before anything is ticked — this Client holds nothing to change", () => {
    render(<ClientServicesPromptView {...baseProps} />);

    expect(assignButton()).toBeDisabled();
  });

  it("ENABLES once a service is ticked", () => {
    render(<ClientServicesPromptView {...baseProps} />);

    fireEvent.click(screen.getByRole("checkbox", { name: /linkedin growth/i }));

    expect(assignButton()).toBeEnabled();
  });

  it("⚠️ DISABLES again when the last tick is removed", () => {
    // ⚠️ THE ONE A LATCHING IMPLEMENTATION FAILS. Back to an empty selection is
    // back to nothing to do — "did the user click?" is the wrong question.
    render(<ClientServicesPromptView {...baseProps} />);
    const linkedin = screen.getByRole("checkbox", { name: /linkedin growth/i });

    fireEvent.click(linkedin);
    expect(assignButton()).toBeEnabled();

    fireEvent.click(linkedin);
    expect(assignButton()).toBeDisabled();
  });

  it("⚠️ DISABLES after a successful assign — the baseline moves to what was saved", () => {
    const { rerender } = render(<ClientServicesPromptView {...baseProps} />);

    fireEvent.click(screen.getByRole("checkbox", { name: /linkedin growth/i }));
    expect(assignButton()).toBeEnabled();

    rerender(
      <ClientServicesPromptView
        {...baseProps}
        state={{ status: "saved", message: "Saved. 1 service assigned." }}
      />,
    );

    expect(assignButton()).toBeDisabled();
  });

  it("⚠️ never shows “Saved.” beside an enabled Assign button", () => {
    // ⚠️ ONE STATE OBJECT ACROSS BOTH RENDERS — `useActionState` returns a new one
    // only when an action completes. A fresh literal would be simulating a SECOND
    // assign, after which re-baselining is correct rather than a bug.
    const SAVED = { status: "saved", message: "Saved. 1 service assigned." } as const;
    const { rerender } = render(<ClientServicesPromptView {...baseProps} state={SAVED} />);

    expect(screen.getByRole("status")).toHaveTextContent(/saved/i);
    expect(assignButton()).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: /linkedin growth/i }));

    expect(assignButton()).toBeEnabled();
    expect(screen.queryByRole("status")).toBeNull();

    rerender(<ClientServicesPromptView {...baseProps} state={SAVED} />);

    expect(screen.queryByRole("status")).toBeNull();
    expect(assignButton()).toBeEnabled();
  });

  it("stays disabled while an assign is in flight, and says so", () => {
    render(<ClientServicesPromptView {...baseProps} pending />);

    expect(screen.getByRole("button", { name: /assigning/i })).toBeDisabled();
  });

  it("⚠️ leaves the ANALYST branch with no button to disable in the first place", () => {
    // Guard against the fix leaking across the isAdmin boundary: dirtiness tracking
    // must not cause a control to render for someone who must never see one.
    const { container } = render(<ClientServicesPromptView {...baseProps} isAdmin={false} />);

    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
  });
});
