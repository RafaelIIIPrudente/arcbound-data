import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Hermetic: the Server Action is replaced by a spy, so this file asserts what the
// FORM sends and shows, not what the action does with it (that lives in
// outreach-actions.test).
//
// The Radix Select polyfills this file used to carry are gone with the selector
// itself: step 01 moved up to `IngestPanel` (S4), so nothing here opens a dropdown.
const { actionMock } = vi.hoisted(() => ({ actionMock: vi.fn() }));
vi.mock("@/app/(app)/upload/outreach-actions", () => ({ ingestOutreachAction: actionMock }));

import { OutreachUploadForm } from "./outreach-upload-form";

const CLIENT = "c2";

/** The FormData the form handed to the action on its most recent submit. */
function lastSubmission(): FormData {
  expect(actionMock).toHaveBeenCalled();
  return actionMock.mock.calls.at(-1)![1] as FormData;
}

beforeEach(() => {
  actionMock.mockReset();
  actionMock.mockResolvedValue(null);
});

describe("OutreachUploadForm — the steps it still owns", () => {
  it("asks for a CSV and a submit — and nothing else", () => {
    // ⚠️ SIMPLER THAN THE LINKEDIN WIZARD BY DESIGN. There is no JSON option, no
    // follower or connection count, and no format review, so borrowing that
    // form's four steps would put empty ceremony on screen.
    //
    // ⚠️ STEP 01 IS NOT MISSING — IT MOVED. The client is chosen once in
    // `IngestPanel` and applies to whichever tab is open (S4), so the staff-facing
    // numbering is unchanged: 01 client, 02 CSV, 03 submit. This form owns 02–03.
    render(<OutreachUploadForm clientId={CLIENT} />);

    expect(screen.queryByText("01")).not.toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByText("03")).toBeInTheDocument();
    expect(screen.queryByText("04")).not.toBeInTheDocument();
  });

  it("no longer owns a client selector", () => {
    render(<OutreachUploadForm clientId={CLIENT} />);

    expect(screen.queryByLabelText("Select client")).toBeNull();
  });

  it("offers NO follower or connection count field", () => {
    // Those are LinkedIn-scrape facts; an outreach snapshot has no such numbers,
    // and a blank box invites somebody to invent one.
    render(<OutreachUploadForm clientId={CLIENT} />);

    expect(screen.queryByLabelText("Follower count")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Connection count")).not.toBeInTheDocument();
  });

  it("offers NO paste-JSON option — the source is a CSV export", () => {
    render(<OutreachUploadForm clientId={CLIENT} />);

    expect(screen.queryByRole("button", { name: /paste json/i })).not.toBeInTheDocument();
  });

  it("keeps the file input KEYBOARD-FOCUSABLE (sr-only, not hidden)", () => {
    // ⚠️ `hidden` would take the control out of the tab order and make the whole
    // upload mouse-only. The LinkedIn form solves it the same way.
    render(<OutreachUploadForm clientId={CLIENT} />);

    const input = screen.getByLabelText("Outreach CSV file");
    expect(input).toBeInTheDocument();
    expect(input).not.toHaveAttribute("hidden");
    expect(input.className).toContain("sr-only");
  });

  it("names the expected columns as help text", () => {
    render(<OutreachUploadForm clientId={CLIENT} />);

    expect(screen.getByText(/Full Name/)).toBeInTheDocument();
    expect(screen.getByText(/Qualified \(ICP\)/)).toBeInTheDocument();
  });
});

describe("OutreachUploadForm — what it submits", () => {
  it("sends the SELECTED client id, never anything read from the file", async () => {
    // ⚠️ ADR 0012: attribution is a human choice, not an inference. That choice now
    // happens one level up in `IngestPanel` and arrives as a prop — but the
    // guarantee is unchanged and still worth asserting: there is no path by which
    // file content can reach `clientId`, because this form never computes it.
    const user = userEvent.setup();
    render(<OutreachUploadForm clientId={CLIENT} />);

    await user.click(screen.getByRole("button", { name: /upload snapshot/i }));

    expect(lastSubmission().get("clientId")).toBe(CLIENT);
  });

  it("sends the file's text as rawText", async () => {
    const user = userEvent.setup();
    render(<OutreachUploadForm clientId={CLIENT} />);

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
    render(<OutreachUploadForm clientId={CLIENT} />);

    expect(screen.getByText(/no file selected/i)).toBeInTheDocument();

    await user.upload(
      screen.getByLabelText("Outreach CSV file"),
      new File(["Full Name\nDana"], "wrong-sheet.csv", { type: "text/csv" }),
    );

    expect(await screen.findByText("wrong-sheet.csv")).toBeInTheDocument();
  });
});

describe("OutreachUploadForm — errors", () => {
  it("still has somewhere to render a clientId error after the selector moved", () => {
    // ⚠️ THE CONTROL LEFT; THE ERROR PATH MUST NOT. The action still validates
    // `clientId`, so a result with nowhere to render would be a validation failure
    // nobody can see. The full assertion is in the result-panel block below.
    actionMock.mockResolvedValue(null);
    render(<OutreachUploadForm clientId={CLIENT} />);

    expect(screen.queryByLabelText("Select client")).toBeNull();
    expect(screen.getByRole("button", { name: /upload snapshot/i })).toBeInTheDocument();
  });
});

describe("OutreachUploadForm — the result panel", () => {
  /** Drive a real submit so `useActionState` holds the mocked result. */
  async function submitWith(result: unknown) {
    actionMock.mockResolvedValue(result);
    const user = userEvent.setup();
    render(<OutreachUploadForm clientId={CLIENT} />);
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

    // Back to the form with a clean slate — the key-bump remount. The CLIENT is
    // deliberately not part of that slate any more (D12): it lives above this
    // component, so uploading again for the same person costs no re-selection.
    expect(await screen.findByText(/no file selected/i)).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
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

    // ⚠️ MATCHED IN FULL, NOT LOOSELY. This used to guard against the Select's
    // "Choose a client…" placeholder making a loose matcher pass vacuously. The
    // placeholder left with the selector, but the full match stays: it is the
    // stronger assertion, and it proves the clientId error still has somewhere to
    // render now that the control it sat under is gone.
    expect(
      await screen.findByText("Choose a client to attach this snapshot to."),
    ).toBeInTheDocument();
  });
});
