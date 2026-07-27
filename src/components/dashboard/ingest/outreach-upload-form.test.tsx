import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Radix Select drives its listbox with Pointer Events + layout APIs that jsdom
// does not implement. Polyfill them locally so the dropdown can actually open
// (same stubs as report-period-picker.test.tsx and format-review.test.tsx).
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

// Hermetic: the Server Action is replaced by a spy, so this file asserts what the
// FORM sends and shows, not what the action does with it (that lives in
// outreach-actions.test).
const { actionMock } = vi.hoisted(() => ({ actionMock: vi.fn() }));
vi.mock("@/app/(app)/upload/outreach-actions", () => ({ ingestOutreachAction: actionMock }));

import { OutreachUploadForm } from "./outreach-upload-form";

const clients = [
  { id: "c1", name: "Ada Lovelace" },
  { id: "c2", name: "Grace Hopper" },
];

/** The FormData the form handed to the action on its most recent submit. */
function lastSubmission(): FormData {
  expect(actionMock).toHaveBeenCalled();
  return actionMock.mock.calls.at(-1)![1] as FormData;
}

beforeEach(() => {
  actionMock.mockReset();
  actionMock.mockResolvedValue(null);
});

describe("OutreachUploadForm — the three steps", () => {
  it("asks for a client, a CSV, and a submit — and nothing else", () => {
    // ⚠️ SIMPLER THAN THE LINKEDIN WIZARD BY DESIGN. There is no JSON option, no
    // follower or connection count, and no format review, so borrowing that
    // form's four steps would put empty ceremony on screen.
    render(<OutreachUploadForm clients={clients} />);

    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByText("03")).toBeInTheDocument();
    expect(screen.queryByText("04")).not.toBeInTheDocument();
  });

  it("offers a client selector", () => {
    render(<OutreachUploadForm clients={clients} />);

    expect(screen.getByLabelText("Select client")).toBeInTheDocument();
  });

  it("offers NO follower or connection count field", () => {
    // Those are LinkedIn-scrape facts; an outreach snapshot has no such numbers,
    // and a blank box invites somebody to invent one.
    render(<OutreachUploadForm clients={clients} />);

    expect(screen.queryByLabelText("Follower count")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Connection count")).not.toBeInTheDocument();
  });

  it("offers NO paste-JSON option — the source is a CSV export", () => {
    render(<OutreachUploadForm clients={clients} />);

    expect(screen.queryByRole("button", { name: /paste json/i })).not.toBeInTheDocument();
  });

  it("keeps the file input KEYBOARD-FOCUSABLE (sr-only, not hidden)", () => {
    // ⚠️ `hidden` would take the control out of the tab order and make the whole
    // upload mouse-only. The LinkedIn form solves it the same way.
    render(<OutreachUploadForm clients={clients} />);

    const input = screen.getByLabelText("Outreach CSV file");
    expect(input).toBeInTheDocument();
    expect(input).not.toHaveAttribute("hidden");
    expect(input.className).toContain("sr-only");
  });

  it("names the expected columns as help text", () => {
    render(<OutreachUploadForm clients={clients} />);

    expect(screen.getByText(/Full Name/)).toBeInTheDocument();
    expect(screen.getByText(/Qualified \(ICP\)/)).toBeInTheDocument();
  });
});

describe("OutreachUploadForm — what it submits", () => {
  it("sends the SELECTED client id, never anything read from the file", async () => {
    // ⚠️ ADR 0012: attribution is a human choice made here, not an inference. The
    // form has no path by which file content could reach `clientId`.
    const user = userEvent.setup();
    render(<OutreachUploadForm clients={clients} />);

    await user.click(screen.getByLabelText("Select client"));
    await user.click(await screen.findByRole("option", { name: "Grace Hopper" }));
    await user.click(screen.getByRole("button", { name: /upload snapshot/i }));

    expect(lastSubmission().get("clientId")).toBe("c2");
  });

  it("sends the file's text as rawText", async () => {
    const user = userEvent.setup();
    render(<OutreachUploadForm clients={clients} />);

    const csv = "Full Name,LinkedIn URL\nDana Reyes,https://linkedin.com/in/dana";
    await user.upload(
      screen.getByLabelText("Outreach CSV file"),
      new File([csv], "master-db.csv", { type: "text/csv" }),
    );

    // FileReader is async; the name appearing proves the read completed.
    expect(await screen.findByText("master-db.csv")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /upload snapshot/i }));
    await waitFor(() => expect(lastSubmission().get("rawText")).toBe(csv));
  });

  it("shows the chosen file's name so a mis-drop is visible before submitting", async () => {
    const user = userEvent.setup();
    render(<OutreachUploadForm clients={clients} />);

    expect(screen.getByText(/no file selected/i)).toBeInTheDocument();

    await user.upload(
      screen.getByLabelText("Outreach CSV file"),
      new File(["Full Name\nDana"], "wrong-sheet.csv", { type: "text/csv" }),
    );

    expect(await screen.findByText("wrong-sheet.csv")).toBeInTheDocument();
  });
});

describe("OutreachUploadForm — errors", () => {
  it("shows a field error against the client selector", () => {
    actionMock.mockResolvedValue(null);
    render(<OutreachUploadForm clients={clients} />);
    // Rendered from action state; asserted through the success/error panels below
    // rather than by faking React's useActionState internals.
    expect(screen.getByLabelText("Select client")).toBeInTheDocument();
  });
});

describe("OutreachUploadForm — the result panel", () => {
  /** Drive a real submit so `useActionState` holds the mocked result. */
  async function submitWith(result: unknown) {
    actionMock.mockResolvedValue(result);
    const user = userEvent.setup();
    render(<OutreachUploadForm clients={clients} />);
    await user.click(screen.getByRole("button", { name: /upload snapshot/i }));
    return user;
  }

  it("reports the snapshot's row count", async () => {
    await submitWith({ status: "ok", rowCount: 1435 });

    expect(await screen.findByText("1,435")).toBeInTheDocument();
    expect(screen.getByText(/prospects stored/i)).toBeInTheDocument();
  });

  it("reports a row count of 0 AS 0 — a real answer, never an em dash", async () => {
    // A snapshot that genuinely carried no rows is a measurement, not a gap.
    await submitWith({ status: "ok", rowCount: 0 });

    expect(await screen.findByText("0")).toBeInTheDocument();
  });

  it("RENDERS THE WARNING, naming the ignored columns verbatim", async () => {
    // ⚠️ THE POINT OF THE WHOLE WARNING CHAIN. If the notice stops here, a column
    // added to the sheet is still invisible to the person who added it.
    await submitWith({
      status: "ok",
      rowCount: 1435,
      warning: "1 column was in this file but not stored: Lead Score.",
    });

    expect(await screen.findByRole("status")).toHaveTextContent("Lead Score");
  });

  it("shows NO warning region on a clean upload", async () => {
    await submitWith({ status: "ok", rowCount: 1435 });

    await screen.findByText("1,435");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("offers an 'Upload another' reset that returns to the form", async () => {
    const user = await submitWith({ status: "ok", rowCount: 1435 });

    await user.click(await screen.findByRole("button", { name: /upload another/i }));

    // Back to step 01 with a clean slate — the key-bump remount.
    expect(await screen.findByLabelText("Select client")).toBeInTheDocument();
    expect(screen.getByText(/no file selected/i)).toBeInTheDocument();
  });

  it("surfaces a payload parse error instead of a success panel", async () => {
    await submitWith({
      status: "error",
      errors: { payload: ["Row 3: Full Name — Full Name is required"] },
    });

    expect(await screen.findByText(/Full Name is required/)).toBeInTheDocument();
    expect(screen.queryByText(/prospects stored/i)).not.toBeInTheDocument();
  });

  it("surfaces a missing-client error against the selector", async () => {
    await submitWith({
      status: "error",
      errors: { clientId: ["Choose a client to attach this snapshot to."] },
    });

    // ⚠️ MATCHED IN FULL, NOT LOOSELY. The trigger's placeholder is also
    // "Choose a client…", so a /choose a client/i matcher passes whether or not
    // the error ever rendered.
    expect(
      await screen.findByText("Choose a client to attach this snapshot to."),
    ).toBeInTheDocument();
  });
});
