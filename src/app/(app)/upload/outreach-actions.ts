"use server";

import { z } from "zod";

import { parseOutreachCsv } from "@/lib/parse-outreach";
import { ingestOutreach } from "@/services/outreach";

// ─────────────────────────────────────────────────────────────────────────────
// The Outreach snapshot upload action. Deliberately the same shape as
// `ingestMetricsAction` next door — envelope validation, then the pure parser,
// then the seam — but simpler: there is no JSON option, no follower or
// connection counts, and no format-review round trip, so there is no `review`
// state and no second submit.
//
// ⚠️ THIS FILE DOES NOT TOUCH THE LINKEDIN PATH. It is a sibling, not a rewrite:
// `actions.ts`, `parse-metrics.ts` and `ingest.ts` are untouched, so the working
// metrics upload carries no risk from this feature.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mirrors `IngestResult`'s discriminated shape, minus the `review` case the
 * outreach flow has no equivalent of.
 */
export type OutreachIngestResult =
  | { status: "error"; errors: Record<string, string[]> }
  | {
      status: "ok";
      /**
       * Rows written into the snapshot.
       *
       * ⚠️ A COUNT, SO 0 IS A REAL ANSWER. It is reported as the database
       * recorded it and is never treated as missing.
       */
      rowCount: number;
      /** Non-blocking notice, e.g. columns in the file that were not stored. */
      warning?: string;
    };

// Envelope validation: the form fields around the payload. The payload itself is
// parsed + row-validated by the pure lib. Uploads never partially write — a
// failure here returns before the seam is ever called.
const envelopeSchema = z.object({
  clientId: z.string().trim().min(1, "Choose a client to attach this snapshot to."),
  rawText: z.string().trim().min(1, "Add the Outreach CSV to upload."),
});

/**
 * A non-blocking notice about columns the file carried and the database has no
 * home for.
 *
 * ⚠️ IT MUST SAY THE DATA WAS NOT STORED. "We noticed an extra column" invites
 * the reader to assume it landed somewhere; the point of this notice is that it
 * did not, and that storing it needs a schema change rather than another upload.
 *
 * Returns `null` for the ordinary 24-column export. A notice on every good file
 * is a notice nobody reads, and the one time it mattered it would be invisible.
 */
function unknownColumnWarning(unknownHeaders: string[]): string | null {
  if (unknownHeaders.length === 0) return null;
  const plural = unknownHeaders.length === 1 ? "column was" : "columns were";
  return (
    `${unknownHeaders.length} ${plural} in this file but not stored: ` +
    `${unknownHeaders.join(", ")}. Every other column uploaded normally. ` +
    `Storing ${unknownHeaders.length === 1 ? "it" : "them"} needs a change to the Outreach table — ` +
    `re-uploading will not help.`
  );
}

export async function ingestOutreachAction(
  _prev: OutreachIngestResult | null,
  formData: FormData,
): Promise<OutreachIngestResult> {
  const parsed = envelopeSchema.safeParse({
    clientId: (formData.get("clientId") ?? "").toString(),
    rawText: (formData.get("rawText") ?? "").toString(),
  });
  if (!parsed.success) {
    return { status: "error", errors: parsed.error.flatten().fieldErrors };
  }

  const { clientId, rawText } = parsed.data;

  // ⚠️ PARSED IN FULL BEFORE THE SEAM IS REACHED, NOT BESIDE IT. A snapshot's
  // header row records how many rows it carried and is immutable, so a partial
  // write would bake in a number nobody can correct. Every parse failure returns
  // from here, with nothing written.
  const payload = parseOutreachCsv(rawText);
  if ("error" in payload) {
    return { status: "error", errors: { payload: [payload.error] } };
  }

  // ⚠️ ATTRIBUTION IS THE SELECTED `clientId` AND NOTHING ELSE (ADR 0012). No
  // column of the file is consulted — this is the human choice the whole
  // no-name-matching decision rests on.
  const { rowCount } = await ingestOutreach(clientId, payload.rows);

  // On a successful write, attach a NON-BLOCKING notice about columns the file
  // carried that the table has no home for. Best-effort by construction: the
  // write is already committed and irreversible, so nothing computed here may
  // change the outcome — it can only add a sentence.
  try {
    const warning = unknownColumnWarning(payload.unknownHeaders);
    if (warning) return { status: "ok", rowCount, warning };
  } catch {
    // Ignore — the snapshot already landed; the notice is only a nicety.
  }

  return { status: "ok", rowCount };
}
