import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ClientIndustryWriterCardView } from "./client-industry-writer-card";
import type { StaffDirectoryEntry } from "@/services/staff";
import type { ClientIndustry, ClientWriter, Industry } from "@/services/types";

const CLIENT = "11111111-1111-1111-1111-111111111111";
const SAAS = "22222222-2222-2222-2222-222222222222";
const FAX = "33333333-3333-3333-3333-333333333333";
const WRITER_A = "44444444-4444-4444-4444-444444444444";
const WRITER_B = "55555555-5555-5555-5555-555555555555";

const ACTIVE: Industry = { id: SAAS, name: "SaaS", status: "active" };
const ARCHIVED: Industry = { id: FAX, name: "Fax Machines", status: "archived" };

const STAFF: StaffDirectoryEntry[] = [
  { userId: WRITER_A, email: "ana@arcbound.com" },
  { userId: WRITER_B, email: "bo@arcbound.com" },
];

function view(overrides: {
  industry?: ClientIndustry | null;
  writer?: ClientWriter;
  industries?: Industry[] | null;
  staff?: StaffDirectoryEntry[] | null;
  isAdmin?: boolean;
}) {
  return render(
    <ClientIndustryWriterCardView
      clientId={CLIENT}
      industry={overrides.industry ?? null}
      writer={overrides.writer ?? null}
      industries={overrides.industries === undefined ? [ACTIVE] : overrides.industries}
      staff={overrides.staff === undefined ? STAFF : overrides.staff}
      isAdmin={overrides.isAdmin ?? true}
      state={{ status: "idle" }}
      formAction={vi.fn()}
      pending={false}
    />,
  );
}

/** What the browser would actually POST from this card, right now. */
function submitted(): FormData {
  const form = document.querySelector("form");
  if (!form) throw new Error("no form rendered");
  return new FormData(form);
}

describe("ClientIndustryWriterCardView — the archived-industry trap", () => {
  it("⚠️ keeps an ARCHIVED current industry when only the writer changes", () => {
    // ⚠️ THE TRAP D9 EXISTS FOR. Every save re-sends both fields, so a picker
    // listing only ACTIVE rows has no option matching a Client already recorded in
    // an archived industry — the select falls back to its first option and the
    // save silently MOVES or CLEARS that industry. The current value must be
    // offered whatever its status.
    view({
      industry: { id: FAX, name: "Fax Machines" },
      writer: { status: "resolved", userId: WRITER_A, email: "ana@arcbound.com" },
      industries: [ACTIVE, ARCHIVED],
    });

    const industrySelect = screen.getByLabelText(/industry/i) as HTMLSelectElement;
    expect(industrySelect.value).toBe(FAX);

    // Change ONLY the writer, exactly as an admin would.
    fireEvent.change(screen.getByLabelText(/writer/i), { target: { value: WRITER_B } });

    const posted = submitted();
    expect(posted.get("industry_id")).toBe(FAX);
    expect(posted.get("writer_id")).toBe(WRITER_B);
  });

  it("marks the archived option as archived, rather than offering it as current", () => {
    view({ industry: { id: FAX, name: "Fax Machines" }, industries: [ACTIVE, ARCHIVED] });

    expect(screen.getByRole("option", { name: /fax machines.*archived/i })).toBeInTheDocument();
  });

  it("does NOT offer an archived industry the client is not already in", () => {
    // Archived means retired. Offering one afresh would resurrect it sideways —
    // the same rule the Services card keeps.
    view({ industry: null, industries: [ACTIVE, ARCHIVED] });

    expect(screen.queryByRole("option", { name: /fax machines/i })).not.toBeInTheDocument();
  });

  it("⚠️ keeps a writer whose account is no longer in the directory", () => {
    // The same trap, on the other field: an assigned writer missing from the
    // directory has no matching option, so an industry-only change would clear it.
    view({
      industry: null,
      writer: { status: "unknown", userId: WRITER_A },
      staff: [{ userId: WRITER_B, email: "bo@arcbound.com" }],
    });

    expect((screen.getByLabelText(/writer/i) as HTMLSelectElement).value).toBe(WRITER_A);
    expect(submitted().get("writer_id")).toBe(WRITER_A);
  });
});

describe("ClientIndustryWriterCardView — empty vs unreadable", () => {
  it("an EMPTY registry invites, and points at the admin screen", () => {
    view({ industries: [] });

    const notice = screen.getByRole("status", { name: /industries/i });
    expect(notice).toHaveTextContent(/settings/i);
    expect(notice).toHaveTextContent(/industries/i);
    expect(notice.textContent ?? "").not.toMatch(/could not|failed|error|unavailable/i);
  });

  it("an UNREADABLE registry says so — different words, different role", () => {
    view({ industries: null });

    const alert = screen.getByRole("alert", { name: /industries/i });
    expect(alert).toHaveTextContent(/could not be read/i);
    expect(alert).toHaveTextContent(/not the same as/i);
  });

  it("⚠️ an unreadable registry PRESERVES the current industry instead of clearing it", () => {
    // ⚠️ There is no picker to select from, so the field must still be POSTED at
    // its current value. Omitting it would make a writer change erase an industry
    // because a read failed — the silent wipe, triggered by an unrelated outage.
    view({ industry: { id: FAX, name: "Fax Machines" }, industries: null });

    const posted = submitted();
    expect(posted.has("industry_id")).toBe(true);
    expect(posted.get("industry_id")).toBe(FAX);
  });

  it("⚠️ an unreadable staff directory PRESERVES the current writer", () => {
    view({ writer: { status: "unavailable", userId: WRITER_A }, staff: null });

    expect(submitted().get("writer_id")).toBe(WRITER_A);
    expect(screen.getByRole("alert", { name: /writer/i })).toHaveTextContent(/could not be read/i);
  });

  it("posts BOTH fields even when nothing is recorded at all", () => {
    // ⚠️ Empty string, not absent: the action refuses an absent field precisely
    // because absence cannot be told apart from a deliberate clear.
    view({ industry: null, writer: null });

    const posted = submitted();
    expect(posted.get("industry_id")).toBe("");
    expect(posted.get("writer_id")).toBe("");
  });
});

describe("ClientIndustryWriterCardView — who may edit", () => {
  it("shows an analyst the values without any way to change them", () => {
    view({
      industry: { id: SAAS, name: "SaaS" },
      writer: { status: "resolved", userId: WRITER_A, email: "ana@arcbound.com" },
      isAdmin: false,
    });

    expect(screen.getByText("SaaS")).toBeInTheDocument();
    expect(screen.getByText("ana@arcbound.com")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
  });

  it("tells an analyst when nothing is recorded, rather than showing a blank", () => {
    view({ industry: null, writer: null, isAdmin: false });

    expect(screen.getAllByText(/not recorded/i).length).toBeGreaterThanOrEqual(2);
  });

  it("⚠️ distinguishes an unresolved writer from an unassigned one", () => {
    // `unavailable` means the directory read failed — NOT that nobody writes for
    // this Client. Collapsing the two would report a staffing gap that isn't real.
    view({ writer: { status: "unavailable", userId: WRITER_A }, isAdmin: false });

    expect(screen.getByText(/could not be looked up/i)).toBeInTheDocument();
  });
});
