import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Radix Select drives its listbox with Pointer Events + layout APIs that jsdom
// does not implement. Polyfill them locally so the dropdown can actually open
// (same stubs as format-review.test.tsx and report-period-picker.test.tsx).
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

// Hermetic: both Server Actions are spies. This file is about the BRANCHING —
// which of the four situations a viewer is in — not about any form's behaviour.
const { metricsActionMock, outreachActionMock, assignActionMock } = vi.hoisted(() => ({
  metricsActionMock: vi.fn(),
  outreachActionMock: vi.fn(),
  assignActionMock: vi.fn(),
}));
vi.mock("@/app/(app)/upload/actions", () => ({ ingestMetricsAction: metricsActionMock }));
vi.mock("@/app/(app)/upload/outreach-actions", () => ({
  ingestOutreachAction: outreachActionMock,
}));
vi.mock("@/app/(app)/clients/[id]/services-actions", () => ({
  setClientServicesAction: assignActionMock,
}));

import type { ArcboundService, ClientServiceAssignment } from "@/services/types";

import { IngestPanel, IngestPanelView } from "./ingest-panel";

const ADA = "c1";
const clients = [
  { id: ADA, name: "Ada Lovelace" },
  { id: "c2", name: "Grace Hopper" },
];

const LINKEDIN: ArcboundService = {
  id: "s-linkedin",
  slug: "linkedin-growth",
  name: "LinkedIn Growth",
  description: null,
  handler: "linkedin_post_metrics",
  status: "active",
  sortOrder: 10,
};
const OUTREACH: ArcboundService = {
  id: "s-outreach",
  slug: "outreach-system",
  name: "Outreach System",
  description: null,
  handler: "outreach_prospects",
  status: "active",
  sortOrder: 20,
};

function assign(clientId: string, serviceId: string): ClientServiceAssignment {
  return { clientId, serviceId, createdAt: "2026-08-03T00:00:00.000Z", createdBy: null };
}

const baseProps = {
  clients,
  isAdmin: true,
  onClientChange: () => {},
};

describe("⚠️ branch 1 — no Client picked yet", () => {
  it("asks for a Client, and does not present that as an error", () => {
    // ⚠️ NOT AN ERROR STATE. Nothing has gone wrong; the viewer simply has not
    // chosen yet, and the screen should read as an invitation, not a failure.
    render(
      <IngestPanelView
        {...baseProps}
        clientId=""
        registry={{ services: [LINKEDIN], assignments: [] }}
      />,
    );

    expect(screen.getByText(/select a client/i)).toBeInTheDocument();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("⚠️ branch 2 — the registry could not be read", () => {
  it("⚠️ RENDERS BOTH PIPELINE TABS rather than taking ingestion offline", () => {
    // ⚠️ CODE BACKSTOPS THE TABLE (ADR 0015). `supabase/arcbound-services.sql`
    // has been applied since 2026-08-14, so these reads ordinarily succeed and
    // this is the degraded path rather than the everyday one — reached whenever
    // a registry read fails, which nothing about being applied prevents.
    //
    // When ArcBase cannot tell which Services a Client holds, showing NOTHING would
    // take the weekly upload routine offline over a failed read — a self-inflicted
    // outage far worse than the problem it is reacting to. Showing everything lets
    // staff keep working; the cost is at worst a tab that turns out not to apply.
    render(<IngestPanelView {...baseProps} clientId={ADA} registry={null} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["LinkedIn Metrics", "Outreach System"]);
  });

  it("says WHY every upload type is showing, so the tabs are not mistaken for fact", () => {
    render(<IngestPanelView {...baseProps} clientId={ADA} registry={null} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/services could not be read/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/all upload types/i);
  });

  it("still asks for a Client first", () => {
    // The fallback widens the tabs; it does not skip the Client.
    render(<IngestPanelView {...baseProps} clientId="" registry={null} />);

    expect(screen.getByText(/select a client/i)).toBeInTheDocument();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });
});

describe("⚠️ branch 3 — the Client holds no Services", () => {
  it("renders no tabs and states the reason", () => {
    render(
      <IngestPanelView
        {...baseProps}
        clientId={ADA}
        registry={{ services: [LINKEDIN, OUTREACH], assignments: [] }}
      />,
    );

    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.getByText(/no services assigned/i)).toBeInTheDocument();
  });

  it("⚠️ offers an ANALYST no assign control on this screen", () => {
    // ⚠️ THE HAZARD THIS SLICE IS BUILT AROUND. `/upload` is open to analysts, and
    // the assign action calls `requireAdmin()`, which denies by THROWING a
    // redirect — so a control here would eject them from the upload page
    // mid-routine. The prompt component owns this rule; the panel must route to it
    // with the viewer's real role rather than assuming admin.
    render(
      <IngestPanelView
        {...baseProps}
        isAdmin={false}
        clientId={ADA}
        registry={{ services: [LINKEDIN], assignments: [] }}
      />,
    );

    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/an admin can assign/i)).toBeInTheDocument();
  });

  it("offers an ADMIN inline assignment without leaving the page", () => {
    render(
      <IngestPanelView
        {...baseProps}
        clientId={ADA}
        registry={{ services: [LINKEDIN], assignments: [] }}
      />,
    );

    expect(screen.getByRole("checkbox", { name: /linkedin growth/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /assign/i })).toBeInTheDocument();
  });
});

describe("⚠️ branch 4 — the Client holds Services", () => {
  it("shows exactly the tabs that Client's Services provide", () => {
    render(
      <IngestPanelView
        {...baseProps}
        clientId={ADA}
        registry={{
          services: [LINKEDIN, OUTREACH],
          assignments: [assign(ADA, OUTREACH.id)],
        }}
      />,
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Outreach System"]);
  });

  it("⚠️ reads the assignments for the SELECTED Client, not for everyone", () => {
    // ⚠️ THE PANEL HOLDS EVERY CLIENT'S ASSIGNMENTS IN ONE ARRAY. Filtering by the
    // wrong id — or not filtering at all — would give every Client the union of
    // everybody's tabs, which looks completely normal and is completely wrong.
    render(
      <IngestPanelView
        {...baseProps}
        clientId={ADA}
        registry={{
          services: [LINKEDIN, OUTREACH],
          // Ada has LinkedIn; Grace has Outreach.
          assignments: [assign(ADA, LINKEDIN.id), assign("c2", OUTREACH.id)],
        }}
      />,
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["LinkedIn Metrics"]);
  });

  it("ignores an assignment pointing at a Service that is no longer in the registry", () => {
    // A dangling row cannot become a tab: there is no Service to describe it, and
    // inventing one would mean guessing which pipeline it meant.
    render(
      <IngestPanelView
        {...baseProps}
        clientId={ADA}
        registry={{
          services: [LINKEDIN],
          assignments: [assign(ADA, LINKEDIN.id), assign(ADA, "s-vanished")],
        }}
      />,
    );

    expect(screen.getAllByRole("tab")).toHaveLength(1);
  });
});

describe("⚠️ IngestPanel — the CONNECTED component, mounted end to end", () => {
  // ⚠️ THE CARRIED DEFECT THIS BLOCK CLOSES. S4 tested `IngestPanelView`
  // exhaustively with `clientId` handed in as a prop, but never mounted the
  // CONNECTED `IngestPanel` that owns the `useState` and wires
  // `onClientChange={setClientId}` to the real Select. Every one of those view
  // tests would have stayed green even if `onClientChange` were unhooked
  // entirely — nothing exercised the actual picker. This block does.
  const clients = [
    { id: "c1", name: "Ada Lovelace" },
    { id: "c2", name: "Grace Hopper" },
  ];
  const LINKEDIN: ArcboundService = {
    id: "s-linkedin",
    slug: "linkedin-growth",
    name: "LinkedIn Growth",
    description: null,
    handler: "linkedin_post_metrics",
    status: "active",
    sortOrder: 10,
  };
  const OUTREACH: ArcboundService = {
    id: "s-outreach",
    slug: "outreach-system",
    name: "Outreach System",
    description: null,
    handler: "outreach_prospects",
    status: "active",
    sortOrder: 20,
  };

  function assign(clientId: string, serviceId: string): ClientServiceAssignment {
    return { clientId, serviceId, createdAt: "2026-08-03T00:00:00.000Z", createdBy: null };
  }

  it("⚠️ picking a Client in the REAL Select changes which tabs render", async () => {
    const user = userEvent.setup();
    render(
      <IngestPanel
        clients={clients}
        isAdmin
        registry={{
          services: [LINKEDIN, OUTREACH],
          // Ada holds only LinkedIn; Grace holds only Outreach — the two must
          // produce visibly different tab sets, or a fixed/frozen `clientId`
          // could not be told apart from a genuinely wired one.
          assignments: [assign("c1", LINKEDIN.id), assign("c2", OUTREACH.id)],
        }}
      />,
    );

    // Before any pick: the invitation, not an error, and no tabs yet.
    expect(screen.getByText(/select a client/i)).toBeInTheDocument();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);

    await user.click(screen.getByLabelText("Select client"));
    await user.click(await screen.findByRole("option", { name: "Ada Lovelace" }));

    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["LinkedIn Metrics"]);

    await user.click(screen.getByLabelText("Select client"));
    await user.click(await screen.findByRole("option", { name: "Grace Hopper" }));

    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Outreach System"]);
  });
});
