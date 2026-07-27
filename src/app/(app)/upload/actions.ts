"use server";

import { z } from "zod";

import { nameMatchWarning } from "@/lib/author-match";
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

  // On a successful write, attach a NON-BLOCKING warning when scraped authors
  // won't match the selected client's name (analytics attribution is a downstream
  // name-match, ADR 0009). Best-effort — it must never fail a successful ingest.
  if (result.status === "ok") {
    try {
      const client = await getClient(clientId);
      const warning = client
        ? (nameMatchWarning(parsedPayload.rows, client.name) ?? undefined)
        : undefined;
      if (warning) return { ...result, warning };
    } catch {
      // Ignore — the write already succeeded; the warning is only a nicety.
    }
  }

  return result;
}
