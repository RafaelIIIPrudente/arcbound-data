import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ClientIndustryWriterCardView } from "./client-industry-writer-card";
import type { ClientIndustry, ClientWriter, Industry, Writer } from "@/services/types";

const CLIENT = "11111111-1111-1111-1111-111111111111";
const SAAS = "22222222-2222-2222-2222-222222222222";
const FAX = "33333333-3333-3333-3333-333333333333";
const WRITER_A = "44444444-4444-4444-4444-444444444444";
const WRITER_B = "55555555-5555-5555-5555-555555555555";

const ACTIVE: Industry = { id: SAAS, name: "SaaS", status: "active" };
const ARCHIVED: Industry = { id: FAX, name: "Fax Machines", status: "archived" };

const ANA: Writer = { id: WRITER_A, name: "Ana Wells", status: "active" };
const BO: Writer = { id: WRITER_B, name: "Bo Chen", status: "active" };
/** Retired. Archiving stops a writer being OFFERED; it evicts nobody. */
const RETIRED: Writer = { id: WRITER_B, name: "Bo Chen", status: "archived" };
const WRITERS: Writer[] = [ANA, BO];

function view(overrides: {
  industry?: ClientIndustry | null;
  writer?: ClientWriter | null;
  industries?: Industry[] | null;
  writers?: Writer[] | null;
  isAdmin?: boolean;
}) {
  return render(
    <ClientIndustryWriterCardView
      clientId={CLIENT}
      industry={overrides.industry ?? null}
      writer={overrides.writer ?? null}
      industries={overrides.industries === undefined ? [ACTIVE] : overrides.industries}
      writers={overrides.writers === undefined ? WRITERS : overrides.writers}
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
      writer: { id: WRITER_A, name: "Ana Wells" },
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

  it("⚠️ keeps an ARCHIVED current writer when only the industry changes", () => {
    // ⚠️ THE SAME TRAP D9 DESCRIBES, ON THE OTHER FIELD, AND NOW LITERALLY THE
    // SAME SHAPE. Archiving a writer stops them being OFFERED; it does not evict
    // the Clients recorded against them. Every save re-sends both fields, so a
    // picker of active rows only would have no option matching this Client and
    // the next save would silently clear the writer.
    view({
      industry: null,
      writer: { id: WRITER_B, name: "Bo Chen" },
      writers: [ANA, RETIRED],
    });

    expect((screen.getByLabelText(/writer/i) as HTMLSelectElement).value).toBe(WRITER_B);
    expect(submitted().get("writer_id")).toBe(WRITER_B);
    expect(screen.getByRole("option", { name: /bo chen.*archived/i })).toBeInTheDocument();
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

  // ─────────────────────────────────────────────────────────────────────────
  // ⚠️ THE WORDS, NOT JUST THE ROLE.
  //
  // The tests above ask for `getByRole("alert", { name: /writer/i })`, and an
  // `aria-label` of "Writer directory" satisfies that exactly as well as a
  // correct one does — which is how this card kept describing a staff directory
  // through the whole slice that deleted it. A screen can be structurally right
  // and say something false.
  // ─────────────────────────────────────────────────────────────────────────

  it("⚠️ names the WRITERS REGISTRY, never a staff directory or an account", () => {
    view({ writers: null });

    const alert = screen.getByRole("alert", { name: /writers registry/i });
    expect(alert).toHaveTextContent(/writers registry could not be read/i);
    // The model this card used to describe is gone; naming it sends an admin to
    // Staff roles for a problem that lives in Settings, Writers.
    expect(document.body.textContent ?? "").not.toMatch(/staff directory/i);
    expect(document.body.textContent ?? "").not.toMatch(/staff accounts/i);
  });

  it("⚠️ an EMPTY writers registry invites, and points at the screen that fixes it", () => {
    view({ writers: [] });

    const notice = screen.getByRole("status", { name: /writers registry/i });
    expect(notice).toHaveTextContent(/none yet/i);
    expect(notice).toHaveTextContent(/settings, writers/i);
    expect(notice.textContent ?? "").not.toMatch(/could not|failed|error/i);
  });

  it("⚠️ an ALL-ARCHIVED registry says so, and does NOT say “none yet”", () => {
    // ⚠️ THE READ SUCCEEDED AND THE REGISTRY IS FULL. "An admin adds them" is
    // false here in the expensive direction — names are unique
    // case-insensitively, so re-adding one returns a constraint error for
    // following the instruction. The same three-state distinction the
    // Add-Client dialog already draws.
    view({ writer: null, writers: [RETIRED] });

    const notice = screen.getByRole("status", { name: /writers registry/i });
    expect(notice).toHaveTextContent(/every writer is archived/i);
    expect(notice).toHaveTextContent(/restore/i);
    expect(notice.textContent ?? "").not.toMatch(/none yet/i);
  });

  it("⚠️ draws the same three states on the INDUSTRY field", () => {
    const { unmount } = view({ industry: null, industries: [] });
    expect(screen.getByRole("status", { name: /industries registry/i })).toHaveTextContent(
      /none yet/i,
    );
    unmount();

    view({ industry: null, industries: [{ id: FAX, name: "Fax Machines", status: "archived" }] });
    const notice = screen.getByRole("status", { name: /industries registry/i });
    expect(notice).toHaveTextContent(/every industry is archived/i);
    expect(notice.textContent ?? "").not.toMatch(/none yet/i);
  });

  it("⚠️ an unreadable writers REGISTRY preserves the current writer", () => {
    // ⚠️ THE READ THAT CAN STILL FAIL. What went away is the writer STATE that a
    // failed read used to produce on a Client; the registry read behind the
    // PICKER is exactly as fallible as the industries one beside it, and the
    // rule is unchanged — no picker to select from means a hidden input carrying
    // the current value, or an industry change erases the writer.
    view({ writer: { id: WRITER_A, name: "Ana Wells" }, writers: null });

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
      writer: { id: WRITER_A, name: "Ana Wells" },
      isAdmin: false,
    });

    expect(screen.getByText("SaaS")).toBeInTheDocument();
    expect(screen.getByText("Ana Wells")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
  });

  it("tells an analyst when nothing is recorded, rather than showing a blank", () => {
    view({ industry: null, writer: null, isAdmin: false });

    expect(screen.getAllByText(/not recorded/i).length).toBeGreaterThanOrEqual(2);
  });

  // ⚠️ DELETED WITH THE STATE IT GUARDED: "distinguishes an unresolved writer
  // from an unassigned one". It asserted that `{ status: "unavailable" }`
  // rendered "could not be looked up" rather than "Not recorded". That value
  // can no longer be constructed — `ClientWriter` is `{ id, name }`, so
  // `writer: { status: "unavailable", userId }` is a compile error, and the
  // only producer, `toWriter`, reads a PostgREST embed that either carries a row
  // or is null. There is no second read left to fail.
});

// ─────────────────────────────────────────────────────────────────────────────
// WHAT AN OPTION IS ALLOWED TO CLAIM.
//
// Both pickers must offer the current value whatever its status, or an unrelated
// save clears it. That rule says nothing about how the odd one out is LABELLED —
// and a label is a claim. ⚠️ An option may not name a status nobody read, and may
// not put an identifier in front of a person who cannot act on one.
// ─────────────────────────────────────────────────────────────────────────────

describe("the pickers do not claim more than they read", () => {
  it("⚠️ does NOT call a writer “archived” when the registry never listed them", () => {
    // ⚠️ THE TWIN OF THE INDUSTRY ASSERTION BELOW. The current writer is absent
    // from the registry entirely, so nothing here read a status — and naming one
    // would be a claim about the registry dressed up as a claim about this
    // Client. The option must still exist, or an industry-only save clears the
    // writer.
    //
    // (This replaces "never renders a raw uuid at an admin", which guarded the
    // old `{ status: "unknown", userId }` value. A writer now carries its own
    // NAME, so there is no id to render and no `userId` to read: the label
    // interpolates `current.name`, and the field the old test needed does not
    // exist on the type.)
    view({ writer: { id: WRITER_A, name: "Ana Wells" }, writers: [BO] });

    const option = screen.getByRole("option", { name: /ana wells/i });
    expect(option.textContent ?? "").not.toMatch(/archived/i);
    expect(option.textContent ?? "").toMatch(/no longer in the writers registry/i);
    expect(submitted().get("writer_id")).toBe(WRITER_A);
  });

  it("⚠️ does NOT call an industry “archived” when the registry never listed it", () => {
    // ⚠️ A STATUS THIS BRANCH DID NOT READ. The current industry is absent from
    // the registry entirely, so nothing here knows whether it is archived — and
    // saying so is a claim about the registry dressed up as a claim about this
    // Client. The foreign key should make this unreachable; the label has to be
    // honest anyway, because "should" is not "does".
    view({
      industry: { id: FAX, name: "Fax Machines" },
      industries: [ACTIVE],
    });

    const option = screen.getByRole("option", { name: /fax machines/i });
    expect(option.textContent ?? "").not.toMatch(/archived/i);
    expect(option.textContent ?? "").toMatch(/no longer in the industries registry/i);
    // Still selected, so an unrelated save re-sends it.
    expect(submitted().get("industry_id")).toBe(FAX);
  });

  it("still says “(archived)” when the registry DID say so", () => {
    view({
      industry: { id: FAX, name: "Fax Machines" },
      industries: [ACTIVE, ARCHIVED],
    });

    expect(screen.getByRole("option", { name: /fax machines.*archived/i })).toBeInTheDocument();
    expect(submitted().get("industry_id")).toBe(FAX);
  });
});
