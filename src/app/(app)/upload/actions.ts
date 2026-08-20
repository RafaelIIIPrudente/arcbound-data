"use server";

import { z } from "zod";

import type { AuthorMatchReport } from "@/lib/author-match";
import { authorMatchReport, nameMatchWarning } from "@/lib/author-match";
import { parseCsv, parseJson } from "@/lib/parse-metrics";
import { getClient } from "@/services/clients";
import { ingestMetrics } from "@/services/ingest";
import type { IngestResult } from "@/services/types";

/** Thousands separators and spaces removed. A non-string is passed through. */
function stripSeparators(v: unknown): unknown {
  return typeof v === "string" ? v.replace(/[,\s]/g, "") : v;
}

/** A whole, non-negative audience count. Rejects decimals, negatives and text. */
function wholeCount(message: string) {
  return z.coerce
    .number()
    .refine((n) => Number.isFinite(n) && Number.isInteger(n) && n >= 0, message);
}

// Envelope validation (case E2): the form fields around the payload. The payload
// itself is parsed + row-validated by the pure lib (case E1). Uploads never
// partially write — a failure here returns before the seam is ever called.
const envelopeSchema = z.object({
  clientId: z.string().trim().min(1, "Choose a client to attach this scrape to."),
  sourceType: z.enum(["csv", "json"]),
  rawText: z.string().trim().min(1, "Add a CSV file or paste JSON to upload."),
  followerCount: z.preprocess(
    // REQUIRED: an empty value → NaN so it fails the numeric check below
    // (z.coerce would otherwise turn "" into 0).
    (v) => {
      const cleaned = stripSeparators(v);
      return cleaned === "" ? NaN : cleaned;
    },
    wholeCount("Enter the follower count as a whole number."),
  ),
  // ⚠️ OPTIONAL, AND EMPTY MAPS TO `undefined` — NOT NaN AND NOT 0. This is the
  // one intended difference from the follower count above. Blank means "this
  // scrape carried no connection count", which must upload cleanly and be stored
  // as absent; mapping it to NaN would reject the upload, and letting `z.coerce`
  // see "" would write a measured zero into an immutable audit row.
  connectionsCount: z.preprocess((v) => {
    const cleaned = stripSeparators(v);
    return cleaned === "" ? undefined : cleaned;
  }, wholeCount("Enter the connection count as a whole number, or leave it blank.").optional()),
});

function parseResolved(value: FormDataEntryValue | null): Record<string, string> | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  try {
    const obj: unknown = JSON.parse(value);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      return Object.fromEntries(
        Object.entries(obj).filter(([, v]) => typeof v === "string"),
      ) as Record<string, string>;
    }
  } catch {
    // Ignore malformed resolved-formats; the review round-trip owns this field.
  }
  return undefined;
}

/**
 * The outcome of comparing this upload's scraped authors to the selected Client.
 *
 * ⚠️ THREE OUTCOMES, NOT TWO, AND `unchecked` IS THE ONE THAT MATTERS. `getClient`
 * can throw (a failed read) or return null (no such row). Either way the client's
 * name is unknown, and **"could not check" is not "matches"** — collapsing it into
 * `match` would silently claim a verification that never happened.
 */
type NameCheck =
  { status: "match" } | { status: "mismatch"; report: AuthorMatchReport } | { status: "unchecked" };

/**
 * ⚠️ SHOWN AFTER A WRITE THAT WENT AHEAD WITHOUT THE CHECK. It must not block —
 * an infrastructure failure is no reason to strand staff holding data they
 * cannot get in — and it must not imply the names were fine.
 *
 * ⚠️ ITS CLOSING SENTENCE CHANGED WITH ADR 0010. It used to read "If these posts
 * don't appear in analytics, a name mismatch is the likely reason", which was the
 * correct advice while attribution was a name match. The posts now appear
 * unconditionally, so that sentence would send a reader to look for a symptom
 * that can no longer occur. What went unchecked is whether this is the right
 * CLIENT — a wrong answer to which is invisible rather than absent.
 */
const NAME_CHECK_UNAVAILABLE =
  "Couldn't check the author names against this client — the client record didn't load, so this upload went ahead unchecked. The posts are filed under the client you selected; if that was the wrong client, nothing here caught it.";

/** Never throws: a failed read is an outcome (`unchecked`), not an exception. */
async function checkAuthorNames(clientId: string, rows: { post_name?: string }[]) {
  let clientName: string;
  try {
    const client = await getClient(clientId);
    if (!client) return { status: "unchecked" } as const;
    clientName = client.name;
  } catch {
    return { status: "unchecked" } as const;
  }

  const report = authorMatchReport(rows, clientName);
  return report.mismatched > 0
    ? ({ status: "mismatch", report } as const)
    : ({ status: "match" } as const);
}

export async function ingestMetricsAction(
  _prev: IngestResult | null,
  formData: FormData,
): Promise<IngestResult> {
  const parsed = envelopeSchema.safeParse({
    clientId: (formData.get("clientId") ?? "").toString(),
    sourceType: (formData.get("sourceType") ?? "").toString(),
    rawText: (formData.get("rawText") ?? "").toString(),
    followerCount: (formData.get("followerCount") ?? "").toString(),
    connectionsCount: (formData.get("connectionsCount") ?? "").toString(),
  });
  if (!parsed.success) {
    return { status: "error", errors: parsed.error.flatten().fieldErrors };
  }

  const { clientId, sourceType, rawText, followerCount, connectionsCount } = parsed.data;

  const parsedPayload = sourceType === "csv" ? parseCsv(rawText) : parseJson(rawText);
  if ("error" in parsedPayload) {
    return { status: "error", errors: { payload: [parsedPayload.error] } };
  }

  // ── THE WRONG-FILE GATE ────────────────────────────────────────────────────
  // ⚠️ BEFORE THE WRITE, AND THAT IS STILL THE ENTIRE POINT — but the reason
  // changed with ADR 0010, so read this before assuming the old one.
  //
  // It USED to be that attribution was a downstream name match (ADR 0009), so
  // posts whose scraped author did not match the Client were written and then
  // appeared nowhere. This check moved in front of the write because the same
  // fact, computed AFTER `ingestMetrics` and attached to the success screen, is a
  // warning arriving after the irreversible act and competing with a green
  // summary — indistinguishable from no warning at all. Fourteen posts were lost
  // that way (docs/decisions/2026-08-18-name-match-attribution-failure.md).
  //
  // Attribution is now the `client_id` stamped from the selection above, so
  // nothing is lost for a name. The gate remains, doing a DIFFERENT job: it is a
  // WRONG-FILE GUARD. An author who is not this Client is the strongest available
  // signal that the wrong file, or the wrong Client, was picked — and the write
  // is still irreversible, so it still has to be caught in front of it.
  // MISATTRIBUTED posts are harder to find than absent ones: they show up as a
  // plausible number on someone else's report.
  //
  // ⚠️ AND STILL BEFORE FORMAT REVIEW, which lives inside the seam. Reviewing
  // formats for a file that is about to be abandoned wastes the operator's
  // attention on the wrong question, and this check touches no database of its
  // own beyond the client read it already needed. ⚠️ DO NOT REORDER.
  //
  // ⚠️ A CONFIRMATION, NOT A BLOCK. A mismatch is sometimes legitimate — a genuine
  // rename, a co-authored post — so staff can proceed deliberately. Blocking would
  // leave them holding data they cannot get in, with no override.
  const nameCheck = await checkAuthorNames(clientId, parsedPayload.rows);
  if (nameCheck.status === "mismatch" && formData.get("confirmNameMismatch") !== "true") {
    return { status: "name-mismatch", report: nameCheck.report };
  }

  // Seam returns 'review' (no write) or 'ok' (all-or-nothing write).
  const result = await ingestMetrics({
    clientId,
    sourceType,
    rows: parsedPayload.rows,
    followerCount,
    // `undefined` when the field was left blank — the seam writes SQL null.
    connectionsCount,
    skipReview: formData.get("skipReview") === "true",
    resolvedFormatTypes: parseResolved(formData.get("resolvedFormatTypes")),
  });

  // ⚠️ THE POST-WRITE WARNING STAYS, AND IT IS NOT REDUNDANT. The gate above is
  // the interruption; this is the reminder on the screen staff actually keep. A
  // staffer who confirmed a mismatch minutes ago still needs the result summary
  // to record that the scrape disagreed about the author — because under ADR 0010
  // the posts are now filed under the chosen Client regardless, so the summary is
  // the last place the disagreement is visible at all.
  //
  // It now reads the check computed BEFORE the write rather than re-reading the
  // client: same answer, one fewer round trip, and no way for the sentence shown
  // here to disagree with the evidence shown on the confirmation screen. The
  // try/catch that used to wrap it moved into `checkAuthorNames`, which cannot
  // throw — so a failed read can no longer be swallowed into silence.
  if (result.status === "ok") {
    if (nameCheck.status === "mismatch") {
      const warning = nameMatchWarning(parsedPayload.rows, nameCheck.report.clientName);
      if (warning) return { ...result, warning };
    }
    if (nameCheck.status === "unchecked") {
      return { ...result, warning: NAME_CHECK_UNAVAILABLE };
    }
  }

  return result;
}
