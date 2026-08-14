import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { paths } from "@/paths";

import { NotAssignedGate, ServicesUnreadableNotice } from "./service-gate";

const CLIENT = "11111111-1111-1111-1111-111111111111";

describe("NotAssignedGate — a Client is not signed up for this section", () => {
  it("⚠️ says NOT ASSIGNED, never NO DATA (D13)", () => {
    // ⚠️ THE WHOLE POINT OF THIS SLICE, RESTATED IN COPY. A Client can hold real
    // rows for a Service they are not currently assigned — an admin un-assigned
    // Outreach from someone with three snapshots, or the S1 backfill missed them.
    // Those rows are WITHHELD, not absent, and the count is not zero. "No outreach
    // data" would be the exact absent-vs-zero collapse this slice exists to kill,
    // wearing the opposite mask — implying an empty run instead of no run at all.
    render(<NotAssignedGate clientId={CLIENT} clientName="Ada Lovelace" sectionName="Outreach" />);

    expect(screen.getByText(/not assigned/i)).toBeInTheDocument();
    expect(screen.queryByText(/no data/i)).toBeNull();
    expect(screen.queryByText(/no outreach data/i)).toBeNull();
  });

  it("names the section and the Client, so the message reads as specific fact", () => {
    render(<NotAssignedGate clientId={CLIENT} clientName="Ada Lovelace" sectionName="Outreach" />);

    expect(screen.getByText(/ada lovelace/i)).toBeInTheDocument();
    expect(screen.getByText(/outreach/i)).toBeInTheDocument();
  });

  it("⚠️ points at THIS CLIENT'S OVERVIEW, never Settings → Services", () => {
    // ⚠️ THE OVERVIEW IS WHERE THE ASSIGNMENT IS FIXED. Settings → Services is the
    // REGISTRY — creating and archiving offerings — and has no per-Client
    // assignment control. Sending a reader there would be a dead end dressed as a
    // fix: they would arrive, find no way to assign anything to this Client, and
    // have to go find the Overview themselves anyway.
    render(<NotAssignedGate clientId={CLIENT} clientName="Ada Lovelace" sectionName="Outreach" />);

    const link = screen.getByRole("link", { name: /overview/i });
    expect(link).toHaveAttribute("href", paths.clients.details(CLIENT));
    expect(link).not.toHaveAttribute("href", paths.settings.services);
  });

  it("renders, and does not 404 or redirect — this is not a security boundary", () => {
    // A pure rendering test proves the point structurally: there is no `notFound()`
    // and no `redirect()` anywhere in this component — it is a component that
    // renders content, full stop. Staff may legitimately look; the gate says why
    // there is nothing to see, it does not refuse to show the page.
    const { container } = render(
      <NotAssignedGate clientId={CLIENT} clientName="Ada Lovelace" sectionName="Outreach" />,
    );

    expect(container.firstChild).not.toBeNull();
  });
});

describe("ServicesUnreadableNotice — the registry could not be read", () => {
  it("⚠️ THE DEGRADED PATH — names the ambiguity in words", () => {
    // ⚠️ RENAMED 2026-08-14, FROM "THIS IS THE LIVE PATH TODAY".
    // `supabase/arcbound-services.sql` was confirmed applied that day, so this
    // read ordinarily succeeds: the notice is NOT what staff see on every page
    // any more, it is what a failed registry read produces. The old title had
    // become the loudest false claim left in the repo, and a test name is read
    // far more often than the body beneath it.
    //
    // ⚠️ THE TEST ITSELF IS UNCHANGED, AND SO IS ITS IMPORTANCE. Only the name
    // moved — no assertion was touched. Rarer is not the same as unnecessary:
    // an unreadable registry is still reachable, and this notice's wording still
    // has to carry the ambiguity out loud when it happens.
    render(<ServicesUnreadableNotice />);

    expect(screen.getByRole("alert")).toHaveTextContent(/could not be read/i);
    // The ambiguity itself, spelled out — not just "an error occurred".
    expect(screen.getByText(/does not do this|may not (be|mean)/i)).toBeInTheDocument();
  });

  it("⚠️ does NOT say 'no data' or 'not assigned' — those are different facts", () => {
    // This notice means "we do not know"; the other two states mean "we know, and
    // the answer is X". Borrowing either wording here would assert a fact this
    // notice does not have.
    render(<ServicesUnreadableNotice />);

    expect(screen.queryByText(/not assigned/i)).toBeNull();
  });
});
