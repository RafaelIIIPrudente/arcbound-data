import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ArcboundServiceAdminRow } from "@/services/arcbound-services";

import { ServiceRowView, ServicesTableView } from "./services-table";

const CODE_BACKED: ArcboundServiceAdminRow = {
  id: "11111111-1111-1111-1111-111111111111",
  slug: "linkedin-growth",
  name: "LinkedIn Growth",
  description: "Weekly scrapes.",
  handler: "linkedin_post_metrics",
  status: "active",
  sortOrder: 10,
  clientCount: 4,
  uploadCount: 37,
  canDelete: false,
};

/** A real, listed offering with no pipeline behind it. */
const NO_PIPELINE: ArcboundServiceAdminRow = {
  id: "22222222-2222-2222-2222-222222222222",
  slug: "advisory",
  name: "Advisory",
  description: null,
  handler: null,
  status: "active",
  sortOrder: 30,
  clientCount: 0,
  uploadCount: 0,
  canDelete: true,
};

const noop = () => {};
const baseProps = {
  state: { status: "idle" as const },
  statusAction: noop,
  deleteAction: noop,
  pending: false,
};

describe("ServiceRowView — what the row says about a Service", () => {
  it("names the pipeline behind a code-backed Service", () => {
    render(<ServiceRowView service={CODE_BACKED} {...baseProps} />);

    expect(screen.getByText("LinkedIn Growth")).toBeInTheDocument();
    expect(screen.getByText(/LinkedIn post metrics/i)).toBeInTheDocument();
  });

  it("⚠️ says 'No data pipeline' for a NULL handler, and uses no em dash", () => {
    // ⚠️ NULL IS A REAL STATE, NOT A MISSING VALUE (ADR 0015). An em dash is this
    // codebase's marker for "could not compute", so using it here would say the
    // opposite of what is true: the offering is listed deliberately and its lack of
    // a pipeline is a decision, not a gap in the data.
    render(<ServiceRowView service={NO_PIPELINE} {...baseProps} />);

    expect(screen.getByText(/no data pipeline/i)).toBeInTheDocument();
    expect(screen.queryByText("—")).toBeNull();
  });
});

describe("ServiceRowView — the Delete control", () => {
  it("⚠️ is driven SOLELY by can_delete, even when the client count disagrees", () => {
    // ⚠️ THE TWO FIXTURES BELOW DELIBERATELY DISAGREE, AND THAT IS THE TEST.
    //
    // `can_delete` comes from `list_services_admin`, which mirrors the rule inside
    // `delete_service`. Re-deriving it here as `clientCount === 0` would be a
    // second copy of a database invariant — and the moment the database's rule
    // gains a condition this one has not heard about, the UI starts offering a
    // Delete that will be refused, or hiding one that would have worked.
    //
    // So: zero clients but can_delete false MUST stay disabled, and four clients
    // with can_delete true MUST be enabled. A `clientCount === 0` implementation
    // fails both.
    const zeroClientsButBlocked = { ...NO_PIPELINE, clientCount: 0, canDelete: false };
    const manyClientsButAllowed = { ...CODE_BACKED, clientCount: 4, canDelete: true };

    const { rerender } = render(<ServiceRowView service={zeroClientsButBlocked} {...baseProps} />);
    expect(screen.getByRole("button", { name: /delete/i })).toBeDisabled();

    rerender(<ServiceRowView service={manyClientsButAllowed} {...baseProps} />);
    expect(screen.getByRole("button", { name: /delete/i })).toBeEnabled();
  });

  it("explains why Delete is unavailable rather than just greying it out", () => {
    render(<ServiceRowView service={CODE_BACKED} {...baseProps} />);

    // A disabled control with no reason trains people to ignore disabled controls.
    expect(screen.getByRole("button", { name: /delete/i })).toHaveAccessibleDescription(
      /4 clients? still receive/i,
    );
  });
});

describe("ServiceRowView — archiving a CODE-BACKED Service", () => {
  it("⚠️ demands the name typed exactly, and names the real consequence first", () => {
    // ⚠️ FRICTION SCALED TO BLAST RADIUS. Archiving a Service with a pipeline
    // removes the upload path for everyone receiving it. The numbers come from the
    // row, so the admin reads what THIS action will actually do rather than a
    // generic "are you sure?" they have learned to click through.
    render(<ServiceRowView service={CODE_BACKED} {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: /^archive/i }));

    const panel = screen.getByRole("group", { name: /archive linkedin growth/i });
    expect(within(panel).getByText(/4 clients/i)).toBeInTheDocument();
    expect(within(panel).getByText(/37 uploads/i)).toBeInTheDocument();

    // Locked until the name matches exactly.
    const confirm = within(panel).getByRole("button", { name: /archive/i });
    expect(confirm).toBeDisabled();

    fireEvent.change(within(panel).getByRole("textbox"), { target: { value: "LinkedIn Growt" } });
    expect(confirm).toBeDisabled();

    fireEvent.change(within(panel).getByRole("textbox"), { target: { value: "LinkedIn Growth" } });
    expect(confirm).toBeEnabled();
  });

  it("says archiving is reversible, because it is", () => {
    render(<ServiceRowView service={CODE_BACKED} {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /^archive/i }));

    expect(screen.getByText(/restore/i)).toBeInTheDocument();
  });

  it("can be backed out of without archiving", () => {
    render(<ServiceRowView service={CODE_BACKED} {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /^archive/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByRole("group", { name: /archive linkedin growth/i })).toBeNull();
  });
});

describe("ServiceRowView — archiving a NO-PIPELINE Service", () => {
  it("⚠️ does NOT demand a typed name — nothing stops flowing", () => {
    // ⚠️ FRICTION IS SPENT, NOT SPRINKLED. A confirmation on every action teaches
    // people to click through confirmations. This Service has no pipeline, so
    // archiving it breaks no upload path; it is a listing change, and reversible.
    render(<ServiceRowView service={NO_PIPELINE} {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: /^archive/i }));

    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

describe("ServiceRowView — an archived Service", () => {
  const ARCHIVED = { ...NO_PIPELINE, status: "archived" as const };

  it("is marked archived and offers Restore instead of Archive", () => {
    render(<ServiceRowView service={ARCHIVED} {...baseProps} />);

    expect(screen.getByText(/archived/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /restore/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^archive$/i })).toBeNull();
  });
});

describe("ServicesTableView — empty is not the same as broken", () => {
  it("⚠️ distinguishes 'nothing registered yet' from 'could not be read'", () => {
    // ⚠️ THE SAME ABSENT-VS-ZERO DISCIPLINE THIS PRODUCT APPLIES EVERYWHERE.
    //
    // An empty registry is a true statement about Arcbound: nothing is registered.
    // A failed read is a statement about ArcBase: we do not know. Rendering both as
    // "No services yet" would tell an admin the registry is empty at the exact
    // moment it might be full and unreachable — and the fix for each is different.
    const { rerender } = render(<ServicesTableView registry={{ status: "ok", services: [] }} />);
    const empty = screen.getByRole("status").textContent ?? "";
    expect(empty).toMatch(/no services/i);

    rerender(<ServicesTableView registry={{ status: "unavailable" }} />);
    const broken = screen.getByRole("alert").textContent ?? "";
    expect(broken).toMatch(/could not be read/i);

    // Not merely different roles — different words.
    expect(broken).not.toEqual(empty);
    expect(broken).not.toMatch(/no services/i);
  });

  it("lists the registry when it reads", () => {
    render(<ServicesTableView registry={{ status: "ok", services: [CODE_BACKED, NO_PIPELINE] }} />);

    expect(screen.getByText("LinkedIn Growth")).toBeInTheDocument();
    expect(screen.getByText("Advisory")).toBeInTheDocument();
  });
});
