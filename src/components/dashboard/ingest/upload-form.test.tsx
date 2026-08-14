import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Hermetic: the Server Action is replaced by a spy, so this file asserts what
// the FORM sends, not what the action does with it (that lives in actions.test).
const { actionMock } = vi.hoisted(() => ({ actionMock: vi.fn() }));
vi.mock("@/app/(app)/upload/actions", () => ({ ingestMetricsAction: actionMock }));

import { MAX_UPLOAD_TEXT_BYTES } from "@/lib/upload-size";

import { UploadForm } from "./upload-form";

const CLIENT = "c1";

/** The FormData the form handed to the action on its most recent submit. */
function lastSubmission(): FormData {
  expect(actionMock).toHaveBeenCalled();
  return actionMock.mock.calls.at(-1)![1] as FormData;
}

beforeEach(() => {
  actionMock.mockReset();
  actionMock.mockResolvedValue(null);
});

describe("UploadForm — step 03 captures both audience counts", () => {
  it("offers a connection count field beside the follower count", async () => {
    render(<UploadForm clientId={CLIENT} />);

    expect(screen.getByLabelText("Follower count")).toBeInTheDocument();
    expect(screen.getByLabelText("Connection count")).toBeInTheDocument();
  });

  it("marks the connection count OPTIONAL on screen, and the follower count required", async () => {
    // Staff must be able to tell, without submitting, which number they can skip.
    render(<UploadForm clientId={CLIENT} />);

    expect(screen.getByText(/follower & connection counts/i)).toBeInTheDocument();
    expect(screen.getByText(/optional/i)).toBeInTheDocument();
  });

  it("submits with the connections field left EMPTY", async () => {
    // ⚠️ THE ACCEPTANCE CASE. Leaving the field blank must not block the upload,
    // and must not invent a value: the field is sent empty and the action maps
    // that to "no count captured".
    const user = userEvent.setup();
    render(<UploadForm clientId={CLIENT} />);

    // Step 02 defaults to CSV (a file drop jsdom cannot read synchronously), so
    // switch to the paste-JSON path to get a payload in.
    await user.click(screen.getByRole("button", { name: "Paste JSON" }));
    // Any non-empty text: the action is a spy here, so the payload is never parsed.
    await user.type(screen.getByRole("textbox", { name: "Paste JSON" }), "scraped rows");
    await user.type(screen.getByLabelText("Follower count"), "18420");
    await user.click(screen.getByRole("button", { name: /upload metrics/i }));

    const sent = lastSubmission();
    expect(sent.get("followerCount")).toBe("18420");
    expect(sent.get("connectionsCount")).toBe("");
    // Never a fabricated zero on the wire.
    expect(sent.get("connectionsCount")).not.toBe("0");
  });

  it("sends a typed connection count", async () => {
    const user = userEvent.setup();
    render(<UploadForm clientId={CLIENT} />);

    // Step 02 defaults to CSV (a file drop jsdom cannot read synchronously), so
    // switch to the paste-JSON path to get a payload in.
    await user.click(screen.getByRole("button", { name: "Paste JSON" }));
    // Any non-empty text: the action is a spy here, so the payload is never parsed.
    await user.type(screen.getByRole("textbox", { name: "Paste JSON" }), "scraped rows");
    await user.type(screen.getByLabelText("Follower count"), "18420");
    await user.type(screen.getByLabelText("Connection count"), "4820");
    await user.click(screen.getByRole("button", { name: /upload metrics/i }));

    expect(lastSubmission().get("connectionsCount")).toBe("4820");
  });
});

describe("⚠️ the Client is a PROP now, and survives a reset (D12)", () => {
  it("sends the clientId it was given", async () => {
    const user = userEvent.setup();
    render(<UploadForm clientId={CLIENT} />);

    await user.click(screen.getByRole("button", { name: "Paste JSON" }));
    await user.type(screen.getByRole("textbox", { name: "Paste JSON" }), "scraped rows");
    await user.type(screen.getByLabelText("Follower count"), "18420");
    await user.click(screen.getByRole("button", { name: /upload metrics/i }));

    // The Server Action's contract is unchanged — it still receives `clientId`.
    expect(lastSubmission().get("clientId")).toBe(CLIENT);
  });

  it("no longer owns a client selector — step 01 lives in IngestPanel", () => {
    render(<UploadForm clientId={CLIENT} />);

    expect(screen.queryByLabelText("Select client")).toBeNull();
    // The staff-facing numbering is unchanged: this form still starts at 02.
    expect(screen.getByText("02")).toBeInTheDocument();
  });

  it("⚠️ KEEPS the client after 'Upload another' remounts the flow", async () => {
    // ⚠️ THE REGRESSION D12 EXISTS TO PREVENT. `key={attempt}` deliberately throws
    // away everything inside the flow; when the Client lived in here it went with
    // it, so uploading a second service for the same person meant re-picking them.
    // As a prop from above it survives — and this asserts the SECOND submission
    // still carries the same client, which is the only thing that actually matters.
    const user = userEvent.setup();
    actionMock.mockResolvedValue({
      status: "ok",
      summary: { inserted: 3, updated: 0, unchanged: 0 },
      warning: null,
    });

    render(<UploadForm clientId={CLIENT} />);

    await user.click(screen.getByRole("button", { name: "Paste JSON" }));
    await user.type(screen.getByRole("textbox", { name: "Paste JSON" }), "scraped rows");
    await user.type(screen.getByLabelText("Follower count"), "18420");
    await user.click(screen.getByRole("button", { name: /upload metrics/i }));

    // Reset the flow.
    await user.click(await screen.findByRole("button", { name: /upload another/i }));

    // Fresh, empty fields — but the same client.
    await user.click(screen.getByRole("button", { name: "Paste JSON" }));
    await user.type(screen.getByRole("textbox", { name: "Paste JSON" }), "more rows");
    await user.type(screen.getByLabelText("Follower count"), "18500");
    await user.click(screen.getByRole("button", { name: /upload metrics/i }));

    expect(lastSubmission().get("clientId")).toBe(CLIENT);
    expect(lastSubmission().get("followerCount")).toBe("18500");
  });
});

describe("an over-limit payload is refused before dispatch", () => {
  // ⚠️ THE FAILURE THIS PREVENTS IS INVISIBLE. Past the Server Action body limit
  // the request is rejected in transport — no validation message, no parse
  // error, nothing this form could render.

  const OVERSIZE = "a".repeat(MAX_UPLOAD_TEXT_BYTES + 1);

  /** Put a large payload in without `user.type` walking it a keystroke at a time. */
  async function pasteOversize(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Paste JSON" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Paste JSON" }), {
      target: { value: OVERSIZE },
    });
  }

  it("⚠️ DISPATCHES NOTHING — the action is never called", async () => {
    const user = userEvent.setup();
    render(<UploadForm clientId={CLIENT} />);

    await pasteOversize(user);
    await user.type(screen.getByLabelText("Follower count"), "18420");
    await user.click(screen.getByRole("button", { name: /upload metrics/i }));

    expect(actionMock).not.toHaveBeenCalled();
  });

  it("⚠️ fires on the FIRST submit — the format review is never reached", async () => {
    // ⚠️ THE GUARD LIVES INSIDE `submit()`, WHICH IS THE SINGLE CHOKE POINT for
    // all three dispatches: the initial upload, the review CONFIRM and the
    // review SKIP. Sited at the button instead, someone could work through the
    // entire format-review screen — reading post titles, choosing formats — for
    // a payload that was never going to land, and only discover it on the second
    // press. Here the review screen is never reached at all.
    const user = userEvent.setup();
    render(<UploadForm clientId={CLIENT} />);

    await pasteOversize(user);
    await user.type(screen.getByLabelText("Follower count"), "18420");
    await user.click(screen.getByRole("button", { name: /upload metrics/i }));

    expect(actionMock).not.toHaveBeenCalled();
    // The review UI is a response to the action; with nothing dispatched it
    // cannot appear, and the form stays on step 02.
    expect(screen.queryByRole("button", { name: /confirm/i })).toBeNull();
    expect(screen.getByRole("button", { name: /upload metrics/i })).toBeInTheDocument();
  });

  it("⚠️ tells THIS uploader to split the file — safe here, unlike Outreach", async () => {
    // Posts are matched on their own id and upserted, so the parts converge on
    // one set. The Outreach form says the opposite, deliberately: there every
    // upload is a complete snapshot and a half file would record a shrunken one.
    const user = userEvent.setup();
    render(<UploadForm clientId={CLIENT} />);

    await pasteOversize(user);
    await user.click(screen.getByRole("button", { name: /upload metrics/i }));

    const message = await screen.findByText(/one upload can carry about 3\.5 MB/);
    expect(message).toHaveTextContent(/Re-uploading the same file will not help/);
    expect(message).toHaveTextContent(/Split the export into smaller files/);
  });

  it("lets a NORMAL payload through untouched", async () => {
    // The discriminator: a guard that blocked everything would satisfy the tests
    // above.
    const user = userEvent.setup();
    render(<UploadForm clientId={CLIENT} />);

    await user.click(screen.getByRole("button", { name: "Paste JSON" }));
    await user.type(screen.getByRole("textbox", { name: "Paste JSON" }), "scraped rows");
    await user.type(screen.getByLabelText("Follower count"), "18420");
    await user.click(screen.getByRole("button", { name: /upload metrics/i }));

    expect(lastSubmission().get("rawText")).toBe("scraped rows");
    expect(screen.queryByText(/one upload can carry about/)).toBeNull();
  });
});
