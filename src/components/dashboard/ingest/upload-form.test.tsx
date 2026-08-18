import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

// Radix Select drives its listbox with Pointer Events + layout APIs that jsdom
// does not implement. Polyfilled here for the same reason as in
// `format-review.test.tsx`: reaching Format Review through the whole flow means
// this file now opens that dropdown too.
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

// ── The pre-write name-match confirmation ────────────────────────────────────
// The action returns `name-mismatch` when the scraped authors won't match the
// selected Client. NOTHING has been written at that point; the form's job is to
// show the evidence and carry the confirmation back on resubmit.

const EITAN = "Eitan Hoenig Eitan Hoenig • You Premium • You";

const MISMATCH = {
  status: "name-mismatch" as const,
  report: {
    clientName: "Eitan Hoenig",
    authors: [
      {
        postName: EITAN,
        cleaned: "Eitan Hoenig Eitan Hoenig • You Premium",
        count: 14,
        matches: false,
      },
    ],
    total: 14,
    mismatched: 14,
  },
};

/** Fill the form and submit once, with the action answering `name-mismatch`. */
async function submitIntoMismatch(user: ReturnType<typeof userEvent.setup>) {
  // ⚠️ A FRESH OBJECT PER CALL, BECAUSE THAT IS WHAT THE REAL ACTION DOES. A
  // Server Action's result is serialized across the RSC boundary, so every
  // completed action yields a new reference — which is exactly what the form's
  // dismissal keys on. `mockResolvedValue(MISMATCH)` would hand back ONE shared
  // object forever, making a second submit indistinguishable from the first and
  // testing a situation that cannot occur.
  actionMock.mockImplementation(async () => ({
    ...MISMATCH,
    report: { ...MISMATCH.report, authors: [...MISMATCH.report.authors] },
  }));
  render(<UploadForm clientId={CLIENT} />);

  await user.click(screen.getByRole("button", { name: "Paste JSON" }));
  await user.type(screen.getByRole("textbox", { name: "Paste JSON" }), "scraped rows");
  await user.type(screen.getByLabelText("Follower count"), "18420");
  await user.click(screen.getByRole("button", { name: /upload metrics/i }));
}

describe("UploadForm — the name-mismatch confirmation", () => {
  it("renders the confirmation instead of the form, with the scraped string", async () => {
    const user = userEvent.setup();
    await submitIntoMismatch(user);

    expect(await screen.findByText(EITAN)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upload metrics/i })).toBeNull();
  });

  it("⚠️ 'Upload anyway' resubmits WITH the confirmation flag", async () => {
    // The flag is what tells the action the interruption was seen and answered.
    // Without it the action would gate again and the upload could never land.
    const user = userEvent.setup();
    await submitIntoMismatch(user);

    await user.click(await screen.findByRole("button", { name: /upload anyway/i }));

    expect(actionMock).toHaveBeenCalledTimes(2);
    expect(lastSubmission().get("confirmNameMismatch")).toBe("true");
  });

  it("carries the whole payload on the confirmed resubmit — nothing is retyped", async () => {
    const user = userEvent.setup();
    await submitIntoMismatch(user);

    await user.click(await screen.findByRole("button", { name: /upload anyway/i }));

    const sent = lastSubmission();
    expect(sent.get("rawText")).toBe("scraped rows");
    expect(sent.get("followerCount")).toBe("18420");
    expect(sent.get("clientId")).toBe(CLIENT);
  });

  it("⚠️ 'Go back' dispatches NOTHING and returns the form with the payload intact", async () => {
    // Going back must not cost the upload: the file is already read in and the
    // counts typed. Losing them would push staff toward "Upload anyway".
    const user = userEvent.setup();
    await submitIntoMismatch(user);

    await user.click(await screen.findByRole("button", { name: /go back/i }));

    expect(actionMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /upload metrics/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Paste JSON" })).toHaveValue("scraped rows");
  });

  it("⚠️ shows the confirmation AGAIN on a fresh submit after going back", async () => {
    // The dismissal is scoped to the answer that produced it, not latched. If it
    // stuck, a second submit of the same bad payload would write in silence —
    // reintroducing the exact defect this screen exists to prevent.
    const user = userEvent.setup();
    await submitIntoMismatch(user);

    await user.click(await screen.findByRole("button", { name: /go back/i }));
    await user.click(screen.getByRole("button", { name: /upload metrics/i }));

    expect(await screen.findByText(EITAN)).toBeInTheDocument();
  });
});

// ── The confirmation must survive the REST OF THE ATTEMPT ────────────────────
// `actions.ts` re-runs the name gate on every dispatch — it cannot know what an
// earlier dispatch was told, and that is the honest server behaviour. So a scrape
// that mismatches on name AND needs Format Review takes several dispatches to
// land, and every one of them has to carry the confirmation.

/**
 * An action mock mirroring the REAL server ordering: the name gate first and
 * required on EVERY dispatch, then the review gate.
 *
 * ⚠️ IT NEVER REMEMBERS A THING, ON PURPOSE. The real action is stateless across
 * dispatches, so if the form stops sending `confirmNameMismatch` the gate fires
 * again — which is exactly the loop under test. Returning fresh objects each call
 * also matches a Server Action result crossing the RSC boundary.
 */
function MISMATCH_ANSWER() {
  return {
    status: "name-mismatch" as const,
    report: {
      clientName: "Eitan Hoenig",
      authors: [{ postName: EITAN, cleaned: "x", count: 1, matches: false }],
      total: 1,
      mismatched: 1,
    },
  };
}

function realisticAction() {
  return async (_prev: unknown, fd: FormData) => {
    if (fd.get("confirmNameMismatch") !== "true") return MISMATCH_ANSWER();
    const settled = fd.get("skipReview") === "true" || fd.get("resolvedFormatTypes") !== null;
    if (!settled) {
      return {
        status: "review" as const,
        posts: [{ linkedin_post_id: "P1", snippet: "a post needing a format" }],
      };
    }
    return { status: "ok" as const, summary: { inserted: 1, updated: 0, unchanged: 0 } };
  };
}

/** Bytes that are valid to type into either slot, so both can hold them at once. */
const SHARED_BYTES = "scraped rows";

/** Fill in a payload and press Upload metrics. */
async function startUpload(user: ReturnType<typeof userEvent.setup>, text = "scraped rows") {
  await user.click(screen.getByRole("button", { name: "Paste JSON" }));
  await user.type(screen.getByRole("textbox", { name: "Paste JSON" }), text);
  await user.type(screen.getByLabelText("Follower count"), "18420");
  await user.click(screen.getByRole("button", { name: /upload metrics/i }));
}

describe("UploadForm — a confirmed mismatch holds for the whole upload attempt", () => {
  it("⚠️ THE LOOP: mismatch + format review must be able to LAND, via skip", async () => {
    // Before the fix this never terminates. `confirmNameMismatch` was scoped to
    // one dispatch, so pressing "Trust scraper & skip" rebuilt the FormData
    // without it, the name gate fired again, and the flow bounced between the two
    // screens forever. That is a REGRESSION: the same upload landed before this
    // slice existed, with only a (too weak) post-write warning.
    const user = userEvent.setup();
    actionMock.mockImplementation(realisticAction());
    render(<UploadForm clientId={CLIENT} />);

    await startUpload(user);
    await user.click(await screen.findByRole("button", { name: /upload anyway/i }));
    await user.click(await screen.findByRole("button", { name: /trust scraper & skip/i }));

    expect(await screen.findByText(/upload complete/i)).toBeInTheDocument();
  });

  it("⚠️ THE LOOP, via 'Confirm & write' with resolved formats", async () => {
    const user = userEvent.setup();
    actionMock.mockImplementation(realisticAction());
    render(<UploadForm clientId={CLIENT} />);

    await startUpload(user);
    await user.click(await screen.findByRole("button", { name: /upload anyway/i }));

    await user.click(await screen.findByRole("combobox", { name: "Post format" }));
    await user.click((await screen.findAllByRole("option"))[0]!);
    await user.click(screen.getByRole("button", { name: /confirm & write/i }));

    expect(await screen.findByText(/upload complete/i)).toBeInTheDocument();
  });

  it("carries the confirmation on the review dispatch, not just the first", async () => {
    const user = userEvent.setup();
    actionMock.mockImplementation(realisticAction());
    render(<UploadForm clientId={CLIENT} />);

    await startUpload(user);
    await user.click(await screen.findByRole("button", { name: /upload anyway/i }));
    await user.click(await screen.findByRole("button", { name: /trust scraper & skip/i }));

    // The skip dispatch must carry BOTH flags — the skip it is for, and the
    // confirmation granted two dispatches ago.
    const sent = lastSubmission();
    expect(sent.get("skipReview")).toBe("true");
    expect(sent.get("confirmNameMismatch")).toBe("true");
  });
});

describe("UploadForm — a confirmation does NOT leak to a different upload", () => {
  it("⚠️ THE LEAK TEST: changing the PAYLOAD re-fires the gate", async () => {
    // The trap in this fix. A bare sticky boolean makes the loop terminate and
    // silently authorises writing a DIFFERENT payload — the exact silent write
    // the gate exists to prevent, coming back in through the fix.
    //
    // ⚠️ THE ROUTE BACK TO THE FORM IS AN `error` ANSWER. `error` renders no
    // screen of its own, so the form returns — payload editable, confirmation
    // already granted. That is the reachable way to hold a confirmation and then
    // change the payload without a remount.
    const user = userEvent.setup();
    actionMock
      .mockImplementationOnce(async () => MISMATCH_ANSWER())
      .mockImplementationOnce(async () => ({
        status: "error" as const,
        errors: { followerCount: ["Enter the follower count as a whole number."] },
      }))
      .mockImplementation(realisticAction());
    render(<UploadForm clientId={CLIENT} />);

    await startUpload(user);
    await user.click(await screen.findByRole("button", { name: /upload anyway/i }));

    // Back on the form, with the confirmation still held.
    const box = await screen.findByRole("textbox", { name: "Paste JSON" });
    await user.type(box, " AND MORE");
    await user.click(screen.getByRole("button", { name: /upload metrics/i }));

    expect(lastSubmission().get("rawText")).toBe("scraped rows AND MORE");
    expect(lastSubmission().get("confirmNameMismatch")).toBeNull();
    expect(await screen.findByText(EITAN)).toBeInTheDocument();
  });

  it("⚠️ THE SAME FOR THE CLIENT: a different client re-fires the gate", async () => {
    // ⚠️ `IngestFlow` is NOT remounted when the client changes — `clientId` is a
    // prop owned by `IngestPanel`, and only `onReset` bumps the key. The picker
    // sits ABOVE this form and stays on screen throughout, so staff can change
    // person while the Format Review screen is up. A flag that ignored the client
    // would carry a confirmation granted for one person straight onto someone
    // else's upload.
    const user = userEvent.setup();
    actionMock.mockImplementation(realisticAction());
    const { rerender } = render(<UploadForm clientId={CLIENT} />);

    await startUpload(user);
    await user.click(await screen.findByRole("button", { name: /upload anyway/i }));
    await screen.findByRole("button", { name: /trust scraper & skip/i });

    rerender(<UploadForm clientId="a-different-client" />);
    await user.click(screen.getByRole("button", { name: /trust scraper & skip/i }));

    expect(lastSubmission().get("clientId")).toBe("a-different-client");
    expect(lastSubmission().get("confirmNameMismatch")).toBeNull();
    expect(await screen.findByText(EITAN)).toBeInTheDocument();
  });

  it("⚠️ 'Go back' does not grant the confirmation — resubmitting re-gates", async () => {
    const user = userEvent.setup();
    actionMock.mockImplementation(realisticAction());
    render(<UploadForm clientId={CLIENT} />);

    await startUpload(user);
    await user.click(await screen.findByRole("button", { name: /go back/i }));
    await user.click(screen.getByRole("button", { name: /upload metrics/i }));

    expect(lastSubmission().get("confirmNameMismatch")).toBeNull();
    expect(await screen.findByText(EITAN)).toBeInTheDocument();
  });

  it("⚠️ 'Upload another' re-gates the next upload", async () => {
    const user = userEvent.setup();
    actionMock.mockImplementation(realisticAction());
    render(<UploadForm clientId={CLIENT} />);

    await startUpload(user);
    await user.click(await screen.findByRole("button", { name: /upload anyway/i }));
    await user.click(await screen.findByRole("button", { name: /trust scraper & skip/i }));
    await screen.findByText(/upload complete/i);

    await user.click(screen.getByRole("button", { name: /upload another/i }));
    await startUpload(user);

    expect(lastSubmission().get("confirmNameMismatch")).toBeNull();
    expect(await screen.findByText(EITAN)).toBeInTheDocument();
  });

  it("⚠️ AND FOR THE SOURCE: identical text read as CSV is a different upload", async () => {
    // The narrow case `rawText` alone cannot catch. CSV and JSON are held in
    // separate state, so switching source normally changes `rawText` too — except
    // when the two happen to hold the SAME bytes. Parsed as CSV rather than JSON
    // those bytes are different rows, hence different authors, hence a different
    // upload that was never confirmed.
    const user = userEvent.setup();
    actionMock
      .mockImplementationOnce(async () => MISMATCH_ANSWER())
      .mockImplementationOnce(async () => ({
        status: "error" as const,
        errors: { followerCount: ["Enter the follower count as a whole number."] },
      }))
      .mockImplementation(realisticAction());
    render(<UploadForm clientId={CLIENT} />);

    // Load the SAME bytes into the CSV slot first, then confirm on the JSON one.
    const file = new File([SHARED_BYTES], "scrape.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("CSV file"), { target: { files: [file] } });
    await screen.findByText("scrape.csv");

    await user.click(screen.getByRole("button", { name: "Paste JSON" }));
    await user.type(screen.getByRole("textbox", { name: "Paste JSON" }), SHARED_BYTES);
    await user.type(screen.getByLabelText("Follower count"), "18420");
    await user.click(screen.getByRole("button", { name: /upload metrics/i }));

    await user.click(await screen.findByRole("button", { name: /upload anyway/i }));

    // The error answer returns the form; switch to CSV — same bytes, new source.
    await user.click(await screen.findByRole("button", { name: "CSV upload" }));
    await user.click(screen.getByRole("button", { name: /upload metrics/i }));

    expect(lastSubmission().get("sourceType")).toBe("csv");
    expect(lastSubmission().get("rawText")).toBe(SHARED_BYTES);
    expect(lastSubmission().get("confirmNameMismatch")).toBeNull();
    expect(await screen.findByText(EITAN)).toBeInTheDocument();
  });

  it("a clean upload is unchanged — no confirmation screen, one dispatch", async () => {
    // The discriminator: a fix that sent the flag always would satisfy the loop
    // tests above while destroying the gate.
    const user = userEvent.setup();
    actionMock.mockImplementation(async () => ({
      status: "ok" as const,
      summary: { inserted: 1, updated: 0, unchanged: 0 },
    }));
    render(<UploadForm clientId={CLIENT} />);

    await startUpload(user);

    expect(await screen.findByText(/upload complete/i)).toBeInTheDocument();
    expect(actionMock).toHaveBeenCalledTimes(1);
    expect(lastSubmission().get("confirmNameMismatch")).toBeNull();
  });
});
