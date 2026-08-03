import { render as rtlRender, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ClientFormState } from "@/app/(app)/clients/actions";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { ArcboundService } from "@/services/types";

import { AddClientFormView, shouldCloseAfter } from "./add-client-dialog";

/**
 * The form's footer uses `DialogClose`, which requires a Dialog context — the view
 * genuinely only ever renders inside one, so the harness supplies it rather than
 * the component being reshaped to suit the test.
 */
function render(ui: React.ReactElement) {
  return rtlRender(
    <Dialog open>
      <DialogContent>{ui}</DialogContent>
    </Dialog>,
  );
}

const LINKEDIN: ArcboundService = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  slug: "linkedin-growth",
  name: "LinkedIn Growth",
  description: null,
  handler: "linkedin_post_metrics",
  status: "active",
  sortOrder: 10,
};
/** Retired in S2 — a brand-new Client can never have held it. */
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
  state: { status: "idle" } as ClientFormState,
  formAction: noop,
  pending: false,
  services: [LINKEDIN, LEGACY_ARCHIVED],
};

describe("AddClientFormView — picking services at registration", () => {
  it("offers the active services", () => {
    render(<AddClientFormView {...baseProps} />);

    expect(screen.getByRole("checkbox", { name: /linkedin growth/i })).toBeInTheDocument();
  });

  it("⚠️ never offers an ARCHIVED service on a brand-new client", () => {
    // ⚠️ ARCHIVED MEANS RETIRED. On the Client Overview a held archived Service is
    // shown so an unrelated save cannot drop it — but a Client being registered
    // right now holds nothing, so there is no history to protect here, and offering
    // it would be assigning a retired offering afresh.
    render(<AddClientFormView {...baseProps} />);

    expect(screen.queryByRole("checkbox", { name: /legacy audit/i })).toBeNull();
  });

  it("⚠️ warns that registering with none selected leaves the client unable to upload", () => {
    // ⚠️ SERVICES ARE NOT REQUIRED — a Client may be registered before the
    // engagement is finalised — but silence would be the same silent outage the S1
    // backfill exists to prevent.
    render(<AddClientFormView {...baseProps} />);

    expect(screen.getByText(/cannot receive uploads/i)).toBeInTheDocument();
  });

  it("⚠️ still allows registration when the registry cannot be read", () => {
    // ⚠️ TRUE TODAY: S1's SQL is not applied, so `listServices()` throws. Blocking
    // client registration on an unrelated unapplied migration would break a
    // working screen; saying so and carrying on does not.
    render(<AddClientFormView {...baseProps} services={null} />);

    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByText(/services could not be loaded/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add client/i })).toBeEnabled();
  });
});

describe("AddClientFormView — reporting the outcome", () => {
  it("shows the partial-success message as an alert", () => {
    render(
      <AddClientFormView
        {...baseProps}
        state={{
          status: "created_services_failed",
          clientId: "c1",
          message: "Ada was registered, but its services could not be saved.",
        }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/services could not be saved/i);
  });

  it("shows the no-services message as a status, not an error", () => {
    // The admin did nothing wrong — they made a valid choice with a consequence.
    render(
      <AddClientFormView
        {...baseProps}
        state={{
          status: "created_without_services",
          clientId: "c1",
          message: "Ada was registered, but has no services yet.",
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/no services yet/i);
  });
});

describe("⚠️ shouldCloseAfter — the dialog closes ONLY when nothing needs saying", () => {
  it("closes on a clean creation", () => {
    expect(shouldCloseAfter({ status: "created", clientId: "c1", message: "" })).toBe(true);
  });

  it.each([["created_without_services"], ["created_services_failed"]])(
    "⚠️ stays OPEN on %s, so the message is actually read",
    (status) => {
      // ⚠️ CLOSING WOULD DESTROY THE MESSAGE. Both of these states exist to tell the
      // admin something about a Client that now EXISTS — that it cannot receive
      // uploads, or that its services did not save. A dialog that closes on them
      // reports the consequence to nobody.
      //
      // Staying open also stops a re-submit creating a duplicate: there is no unique
      // constraint on clients (ADR 0009), so "did it work?" plus a second click is a
      // real way to end up with two.
      expect(
        shouldCloseAfter({
          status: status as "created_without_services" | "created_services_failed",
          clientId: "c1",
          message: "",
        }),
      ).toBe(false);
    },
  );

  it("stays open on idle and on error", () => {
    expect(shouldCloseAfter({ status: "idle" })).toBe(false);
    expect(shouldCloseAfter({ status: "error" })).toBe(false);
  });
});
