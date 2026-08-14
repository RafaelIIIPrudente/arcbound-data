import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { voidMock, unvoidMock } = vi.hoisted(() => ({
  voidMock: vi.fn(),
  unvoidMock: vi.fn(),
}));
vi.mock("@/app/(app)/clients/[id]/outreach/void-actions", () => ({
  voidSnapshotAction: voidMock,
  unvoidSnapshotAction: unvoidMock,
}));

import { SnapshotHistory, type SnapshotHistoryRow } from "./snapshot-history";

function row(over: Partial<SnapshotHistoryRow> = {}): SnapshotHistoryRow {
  return {
    id: "up1",
    createdAt: "2026-07-27T09:00:00.000Z",
    rowCount: 1435,
    uploadedBy: "you",
    voidedAt: null,
    voidedBy: "unrecorded",
    canVoid: true,
    ...over,
  };
}

beforeAll(() => {
  // Radix's Dialog needs the Pointer Events jsdom does not implement.
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

beforeEach(() => {
  voidMock.mockReset();
  voidMock.mockResolvedValue({ status: "ok" });
  unvoidMock.mockReset();
  unvoidMock.mockResolvedValue({ status: "ok" });
});

describe("attribution — three sentences, and a null is never a person", () => {
  it("renders YOU, ANOTHER USER and NOT RECORDED as three distinct strings", () => {
    render(
      <SnapshotHistory
        clientName="Ada Lovelace"
        rows={[
          row({ id: "a", uploadedBy: "you" }),
          row({ id: "b", uploadedBy: "another" }),
          row({ id: "c", uploadedBy: "unrecorded" }),
        ]}
      />,
    );

    expect(screen.getByText(/Uploaded by You/)).toBeInTheDocument();
    expect(screen.getByText(/Uploaded by Another user/)).toBeInTheDocument();
    expect(screen.getByText(/Uploaded by Not recorded/)).toBeInTheDocument();
  });

  it("⚠️ never describes an unrecorded uploader as a person", () => {
    // ⚠️ THE COLLAPSE THIS GUARDS. "Another user" asserts a colleague who may
    // not exist and sends the reader looking for someone to ask.
    render(
      <SnapshotHistory clientName="Ada Lovelace" rows={[row({ uploadedBy: "unrecorded" })]} />,
    );

    expect(screen.queryByText(/Another user/)).toBeNull();
  });

  it("names who VOIDED a row, separately from who uploaded it", () => {
    render(
      <SnapshotHistory
        clientName="Ada Lovelace"
        rows={[
          row({ uploadedBy: "another", voidedAt: "2026-08-14T10:00:00.000Z", voidedBy: "you" }),
        ]}
      />,
    );

    expect(screen.getByText(/Uploaded by Another user · Voided by You/)).toBeInTheDocument();
  });
});

describe("controls — exactly one, and only where it can succeed", () => {
  it("offers VOID on a live row and UN-VOID on a voided one, never both", () => {
    render(
      <SnapshotHistory
        clientName="Ada Lovelace"
        rows={[
          row({ id: "live", voidedAt: null }),
          row({ id: "dead", voidedAt: "2026-08-14T10:00:00.000Z" }),
        ]}
      />,
    );

    const [live, dead] = screen.getAllByRole("listitem");
    expect(within(live!).getByRole("button", { name: /^Void$/ })).toBeInTheDocument();
    expect(within(live!).queryByRole("button", { name: /Un-void/ })).toBeNull();
    expect(within(dead!).getByRole("button", { name: /Un-void/ })).toBeInTheDocument();
    expect(within(dead!).queryByRole("button", { name: /^Void$/ })).toBeNull();
  });

  it("⚠️ renders NO control at all when canVoid is false — not a disabled one", () => {
    // ⚠️ A disabled button invites hovering and wondering; its absence says the
    // same thing without the invitation. A control that would raise 42501 on
    // every press teaches staff the app is broken rather than that the row is
    // not theirs.
    render(<SnapshotHistory clientName="Ada Lovelace" rows={[row({ canVoid: false })]} />);

    expect(screen.queryByRole("button", { name: /Void|Un-void/ })).toBeNull();
  });

  it("still marks a row LIVE or VOIDED even with no control", () => {
    // The state is information; the control is permission. Losing the first with
    // the second would hide the void from everyone who cannot reverse it.
    render(
      <SnapshotHistory
        clientName="Ada Lovelace"
        rows={[row({ canVoid: false, voidedAt: "2026-08-14T10:00:00.000Z" })]}
      />,
    );

    expect(screen.getByText("Voided")).toBeInTheDocument();
  });
});

describe("voiding is confirmed; un-voiding is not", () => {
  it("⚠️ names the CLIENT, the row count and the date before voiding", async () => {
    // ⚠️ THE MISTAKE BEING CORRECTED IS USUALLY MIS-ATTRIBUTION, so the dialog
    // has to let someone catch "wrong Client" BEFORE they confirm. A bare "Are
    // you sure?" cannot do that.
    const user = userEvent.setup();
    render(<SnapshotHistory clientName="Ada Lovelace" rows={[row({ rowCount: 1435 })]} />);

    await user.click(screen.getByRole("button", { name: /^Void$/ }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(within(dialog).getByText(/1,435 rows/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Jul 27, 2026/)).toBeInTheDocument();
    // Nothing has happened yet — the dialog is a gate, not a receipt.
    expect(voidMock).not.toHaveBeenCalled();
  });

  it("calls the action only after the dialog is confirmed", async () => {
    const user = userEvent.setup();
    render(<SnapshotHistory clientName="Ada Lovelace" rows={[row({ id: "up9" })]} />);

    await user.click(screen.getByRole("button", { name: /^Void$/ }));
    await user.click(await screen.findByRole("button", { name: "Void snapshot" }));

    expect(voidMock).toHaveBeenCalledWith("up9");
  });

  it("cancelling voids nothing", async () => {
    const user = userEvent.setup();
    render(<SnapshotHistory clientName="Ada Lovelace" rows={[row()]} />);

    await user.click(screen.getByRole("button", { name: /^Void$/ }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(voidMock).not.toHaveBeenCalled();
  });

  it("un-voids immediately — the SAFE direction needs no confirmation", async () => {
    const user = userEvent.setup();
    render(
      <SnapshotHistory
        clientName="Ada Lovelace"
        rows={[row({ id: "up7", voidedAt: "2026-08-14T10:00:00.000Z" })]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Un-void/ }));

    expect(unvoidMock).toHaveBeenCalledWith("up7");
  });

  it("⚠️ sends ONLY the upload id — no permission value travels to the action", async () => {
    // ⚠️ `canVoid` decides what to SHOW and must never be mistaken for
    // authorisation. If it reached the action it would be worthless anyway: a
    // browser can send anything. The database refuses on its own authority.
    const user = userEvent.setup();
    render(<SnapshotHistory clientName="Ada Lovelace" rows={[row({ id: "up9" })]} />);

    await user.click(screen.getByRole("button", { name: /^Void$/ }));
    await user.click(await screen.findByRole("button", { name: "Void snapshot" }));

    expect(voidMock.mock.calls[0]).toEqual(["up9"]);
  });
});

describe("a refusal is shown, never swallowed", () => {
  it("surfaces the action's error message rather than reporting success", async () => {
    // ⚠️ THE OUTCOME THIS EXISTS TO PREVENT: a message saying the snapshot was
    // voided beside a list where nothing moved.
    const user = userEvent.setup();
    voidMock.mockResolvedValue({
      status: "error",
      message: "Void failed: no such outreach upload, or not yours to void",
    });
    render(<SnapshotHistory clientName="Ada Lovelace" rows={[row()]} />);

    await user.click(screen.getByRole("button", { name: /^Void$/ }));
    await user.click(await screen.findByRole("button", { name: "Void snapshot" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/not yours to void/);
  });
});

describe("an unreadable history is not an empty one", () => {
  it("⚠️ says the history could not be read, and shows NO rows", () => {
    // ⚠️ `listOutreachUploads` NULLS A TRUNCATED READ AS WELL AS A FAILED ONE,
    // because a partial upload history would misdate when this client's outreach
    // began. Rendering it as "no snapshots" would be a confident lie.
    render(<SnapshotHistory clientName="Ada Lovelace" rows={null} />);

    // The copy uses a typographic apostrophe (`&rsquo;`), so the matcher steps
    // around it rather than asserting the wrong character.
    expect(screen.getByText(/could not read this client.s upload history in full/i)).toBeVisible();
    expect(screen.queryByRole("listitem")).toBeNull();
    expect(screen.queryByText(/No snapshots have been uploaded/)).toBeNull();
  });

  it("distinguishes that from a genuinely empty history", () => {
    // The discriminator: without it, the test above could pass by pointing both
    // states at one panel.
    render(<SnapshotHistory clientName="Ada Lovelace" rows={[]} />);

    expect(screen.getByText(/No snapshots have been uploaded/)).toBeInTheDocument();
    expect(screen.queryByText(/could not read/i)).toBeNull();
  });
});
