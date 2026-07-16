"use server";

import { z } from "zod";

import { parseCsv, parseJson } from "@/lib/parse-metrics";
import { ingestMetrics } from "@/services/ingest";
import type { IngestResult } from "@/services/types";

// Envelope validation (case E2): the form fields around the payload. The payload
// itself is parsed + row-validated by the pure lib (case E1). Uploads never
// partially write — a failure here returns before the seam is ever called.
const envelopeSchema = z.object({
  clientId: z.string().trim().min(1, "Choose a client to attach this scrape to."),
  sourceType: z.enum(["csv", "json"]),
  rawText: z.string().trim().min(1, "Add a CSV file or paste JSON to upload."),
  followerCount: z.preprocess(
    (v) => {
      if (typeof v !== "string") return v;
      // Strip thousands separators/spaces; an empty value → NaN so it fails the
      // required + numeric check below (z.coerce would otherwise turn "" into 0).
      const cleaned = v.replace(/[,\s]/g, "");
      return cleaned === "" ? NaN : cleaned;
    },
    z.coerce
      .number()
      .refine(
        (n) => Number.isFinite(n) && Number.isInteger(n) && n >= 0,
        "Enter the follower count as a whole number.",
      ),
  ),
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
  });
  if (!parsed.success) {
    return { status: "error", errors: parsed.error.flatten().fieldErrors };
  }

  const { clientId, sourceType, rawText, followerCount } = parsed.data;

  const parsedPayload = sourceType === "csv" ? parseCsv(rawText) : parseJson(rawText);
  if ("error" in parsedPayload) {
    return { status: "error", errors: { payload: [parsedPayload.error] } };
  }

  // Seam returns 'review' (no write) or 'ok' (all-or-nothing write).
  return ingestMetrics({
    clientId,
    sourceType,
    rows: parsedPayload.rows,
    followerCount,
    skipReview: formData.get("skipReview") === "true",
    resolvedFormatTypes: parseResolved(formData.get("resolvedFormatTypes")),
  });
}
