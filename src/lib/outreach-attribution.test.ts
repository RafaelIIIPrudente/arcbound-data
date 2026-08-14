import { describe, expect, it } from "vitest";

import { attribute, canVoidSnapshot } from "./outreach-attribution";

const ME = "11111111-1111-1111-1111-111111111111";
const SOMEONE_ELSE = "22222222-2222-2222-2222-222222222222";

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THIS MODULE IS AFFORDANCE, NOT AUTHORISATION.
//
// `canVoidSnapshot` decides what the screen SHOWS. The RPC's
// `coalesce(uploaded_by = auth.uid(), false) or public.is_admin()` decides what
// is ALLOWED, inside a SECURITY DEFINER body where RLS does not apply. Nothing
// here is a security control, and no test in this file shows that a database
// refuses anybody.
//
// It still has to be right: a control offered where the RPC will always refuse
// teaches staff that the app is broken rather than that the action is not
// theirs.
// ─────────────────────────────────────────────────────────────────────────────

describe("attribute — three outcomes, because uploaded_by is nullable", () => {
  it("says YOU for the current user's own row", () => {
    expect(attribute(ME, ME)).toBe("you");
  });

  it("says ANOTHER USER for a different, RECORDED uuid", () => {
    // Q6/D2: staff identities are not resolvable — `staff_roles` carries no name
    // or email and `auth.users` is unreadable by `authenticated` — so the honest
    // rendering names no person.
    expect(attribute(SOMEONE_ELSE, ME)).toBe("another");
  });

  it("⚠️ says UNRECORDED for a null uuid — never 'another user'", () => {
    // ⚠️ THE THIRD OUTCOME, AND THE ONE THAT GETS COLLAPSED. A null
    // `uploaded_by` means NOBODY was recorded — rows written from the SQL editor
    // carry no `auth.uid()` at all. Calling that "Another user" asserts a person
    // who may not exist, and sends whoever reads it looking for a colleague to
    // ask.
    expect(attribute(null, ME)).toBe("unrecorded");
  });

  it("still says UNRECORDED when there is no signed-in user either", () => {
    // Both null must not read as "you" by accident of `null === null`.
    expect(attribute(null, null)).toBe("unrecorded");
  });

  it("says ANOTHER USER for a recorded uuid when nobody is signed in", () => {
    expect(attribute(SOMEONE_ELSE, null)).toBe("another");
  });
});

describe("canVoidSnapshot — offer the control only where the RPC would allow it", () => {
  it("is TRUE for the caller's own upload", () => {
    expect(canVoidSnapshot(ME, ME, false)).toBe(true);
  });

  it("is TRUE for an admin on ANY upload, including someone else's", () => {
    // `public.is_admin()` is the second arm of the RPC's predicate.
    expect(canVoidSnapshot(SOMEONE_ELSE, ME, true)).toBe(true);
  });

  it("is FALSE for a non-admin on someone else's upload", () => {
    expect(canVoidSnapshot(SOMEONE_ELSE, ME, false)).toBe(false);
  });

  it("⚠️ is FALSE for a NON-ADMIN on a NULL-UPLOADER row", () => {
    // ⚠️ THE CASE A NAIVE `uploadedBy === currentUserId` GETS RIGHT BY LUCK AND A
    // NAIVE `?? ""` GETS WRONG. Under the RPC's fail-closed guard a null uploader
    // matches NOBODY, so a non-admin pressing this button would get 42501 every
    // single time. A control that always fails is worse than no control: it
    // teaches staff the app is broken rather than that the row is not theirs.
    expect(canVoidSnapshot(null, ME, false)).toBe(false);
  });

  it("is TRUE for an ADMIN on a null-uploader row — the second arm still holds", () => {
    // ⚠️ THE DISCRIMINATOR. Without this, the rule above could be satisfied by
    // hiding the control from everyone on a null row, which would leave nobody
    // able to correct a snapshot uploaded from the SQL editor.
    expect(canVoidSnapshot(null, ME, true)).toBe(true);
  });

  it("⚠️ is FALSE when NOBODY is signed in, even against a null uploader", () => {
    // `null === null` is true in JavaScript and false in the database's
    // `coalesce(null = null, false)`. Without an explicit guard the UI would
    // offer a control to a signed-out caller on every unattributed row.
    expect(canVoidSnapshot(null, null, false)).toBe(false);
  });
});
