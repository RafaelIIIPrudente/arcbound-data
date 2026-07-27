import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Hermetic: the Server Action is replaced by a spy, so this file asserts what
// the FORM sends, not what the action does with it (that lives in actions.test).
const { actionMock } = vi.hoisted(() => ({ actionMock: vi.fn() }));
vi.mock("@/app/(app)/upload/actions", () => ({ ingestMetricsAction: actionMock }));

import { UploadForm } from "./upload-form";

const clients = [{ id: "c1", name: "Ada Lovelace" }];

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
    render(<UploadForm clients={clients} />);

    expect(screen.getByLabelText("Follower count")).toBeInTheDocument();
    expect(screen.getByLabelText("Connection count")).toBeInTheDocument();
  });

  it("marks the connection count OPTIONAL on screen, and the follower count required", async () => {
    // Staff must be able to tell, without submitting, which number they can skip.
    render(<UploadForm clients={clients} />);

    expect(screen.getByText(/follower & connection counts/i)).toBeInTheDocument();
    expect(screen.getByText(/optional/i)).toBeInTheDocument();
  });

  it("submits with the connections field left EMPTY", async () => {
    // ⚠️ THE ACCEPTANCE CASE. Leaving the field blank must not block the upload,
    // and must not invent a value: the field is sent empty and the action maps
    // that to "no count captured".
    const user = userEvent.setup();
    render(<UploadForm clients={clients} />);

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
    render(<UploadForm clients={clients} />);

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
