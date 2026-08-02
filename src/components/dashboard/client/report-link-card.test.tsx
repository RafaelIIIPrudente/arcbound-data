import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ReportLinkStatus } from "@/services/types";

import { ReportLinkCardView } from "./report-link-card";

const CLIENT = "11111111-1111-1111-1111-111111111111";

const ACTIVE: ReportLinkStatus = {
  clientId: CLIENT,
  url: "https://app.example/r/abc123def456",
  createdAt: "2026-07-20T10:00:00.000Z",
  lastAccessedAt: "2026-07-24T09:00:00.000Z",
  active: true,
};

const noop = () => {};
const baseProps = {
  error: null,
  pending: false,
  createAction: noop,
  rotateAction: noop,
  revokeAction: noop,
  // The card's original audience. Every test below this line predates the role
  // boundary and keeps asserting exactly what it asserted then; the analyst view
  // is covered separately at the bottom of the file.
  isAdmin: true,
};

afterEach(() => vi.restoreAllMocks());

describe("ReportLinkCardView — no active link", () => {
  it("shows a Create button when status is null", () => {
    render(<ReportLinkCardView status={null} issued={null} {...baseProps} />);
    expect(screen.getByRole("button", { name: /create client link/i })).toBeInTheDocument();
  });

  it("shows a Create button when the link is revoked (active: false)", () => {
    render(
      <ReportLinkCardView status={{ ...ACTIVE, active: false }} issued={null} {...baseProps} />,
    );
    expect(screen.getByRole("button", { name: /create client link/i })).toBeInTheDocument();
  });
});

describe("ReportLinkCardView — active link", () => {
  it("shows the copyable URL, created / last-accessed, and Rotate + Revoke", () => {
    render(<ReportLinkCardView status={ACTIVE} issued={null} {...baseProps} />);
    expect(screen.getByText(ACTIVE.url)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /rotate/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /revoke/i })).toBeInTheDocument();
    // A copy affordance for the URL.
    expect(screen.getAllByRole("button", { name: /copy/i }).length).toBeGreaterThanOrEqual(1);
  });

  it("⚠️ does NOT render an Access Code on a plain render of an active link", () => {
    render(<ReportLinkCardView status={ACTIVE} issued={null} {...baseProps} />);
    // The code lives only in the transient action result, never in ReportLinkStatus.
    expect(screen.queryByTestId("access-code-panel")).toBeNull();
    expect(screen.queryByText(/won.t be shown again/i)).toBeNull();
  });
});

describe("ReportLinkCardView — one-time Access Code (just issued)", () => {
  const ISSUED = { url: "https://app.example/r/abc123def456", accessCode: "K7QMR4TX" };

  it("renders the Access Code exactly once with a 'copy it now' affordance", () => {
    render(<ReportLinkCardView status={ACTIVE} issued={ISSUED} {...baseProps} />);
    expect(screen.getByTestId("access-code-panel")).toBeInTheDocument();
    expect(screen.getByText("K7QMR4TX")).toBeInTheDocument();
    expect(screen.getByText(/won.t be shown again/i)).toBeInTheDocument();
    // Copy affordances for BOTH the url and the code.
    expect(screen.getAllByRole("button", { name: /copy/i }).length).toBeGreaterThanOrEqual(2);
  });
});

describe("ReportLinkCardView — revoke uses an INLINE confirm (never the native dialog)", () => {
  it("reveals an inline confirm step and does not call window.confirm", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ReportLinkCardView status={ACTIVE} issued={null} {...baseProps} />);

    // Before: no confirm step visible.
    expect(screen.queryByRole("button", { name: /yes, revoke/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^revoke/i }));

    // After: an inline confirm appears (Confirm + Cancel), and the native dialog
    // was never used.
    expect(screen.getByRole("button", { name: /yes, revoke/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("Cancel backs out of the confirm step", () => {
    render(<ReportLinkCardView status={ACTIVE} issued={null} {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /^revoke/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("button", { name: /yes, revoke/i })).toBeNull();
  });
});

describe("ReportLinkCardView — a Data Analyst (isAdmin: false)", () => {
  const analystProps = { ...baseProps, isAdmin: false };

  it("⚠️ STILL SEES the link's status, and sees no control that would change it", () => {
    // ⚠️ THE TWO HALVES ARE IN ONE TEST ON PURPOSE.
    //
    // ADR 0013 removes ACTION affordances, never INFORMATION. Split across two
    // tests, a change that blanked the whole card for analysts would still leave
    // the "no buttons" test green and looking like a pass. Asserting that the
    // status survives IN THE SAME TEST as the buttons disappearing is what makes
    // over-hiding fail.
    render(<ReportLinkCardView status={ACTIVE} issued={null} {...analystProps} />);

    // Reading survives, in full.
    expect(screen.getByText(ACTIVE.url)).toBeInTheDocument();
    expect(screen.getByText(/created/i)).toBeInTheDocument();
    expect(screen.getByText(/last opened/i)).toBeInTheDocument();
    // Copying a URL is reading, not changing — the analyst keeps it.
    expect(screen.getAllByRole("button", { name: /copy/i }).length).toBeGreaterThanOrEqual(1);

    // Changing does not.
    expect(screen.queryByRole("button", { name: /rotate/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /revoke/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /create client link/i })).toBeNull();
  });

  it("sees no Create button when the client has no link", () => {
    render(<ReportLinkCardView status={null} issued={null} {...analystProps} />);

    expect(screen.queryByRole("button", { name: /create client link/i })).toBeNull();
  });

  it("sees no Create button when the link is revoked (active: false)", () => {
    render(
      <ReportLinkCardView status={{ ...ACTIVE, active: false }} issued={null} {...analystProps} />,
    );

    expect(screen.queryByRole("button", { name: /create client link/i })).toBeNull();
  });

  it("has no hidden route to the confirm step — the whole flow is absent", () => {
    // Not merely "Revoke is not rendered": there is no path to `Yes, revoke`
    // either, so a disabled-shell regression that left the confirm reachable
    // would fail here.
    render(<ReportLinkCardView status={ACTIVE} issued={null} {...analystProps} />);

    expect(screen.queryByRole("button", { name: /yes, revoke/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /cancel/i })).toBeNull();
  });
});
