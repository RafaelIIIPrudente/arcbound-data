import Papa from "papaparse";
import { z } from "zod";

import type { OutreachRow } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Pure, environment-agnostic parsing + validation for one Outreach System
// snapshot: the 24-column "Arcbound LinkedIn Master Database" CSV export. No
// I/O, no clock, no randomness — the same text always yields the same rows.
//
// papaparse handles RFC-4180 quoting, which is not optional here: the real
// `Notes` and `LinkedIn Message` columns contain commas, quotes and newlines.
//
// ⚠️ THIS BOUNDARY MAKES EXACTLY ONE JUDGEMENT: was the cell blank? Everything
// else is stored byte-for-byte as it arrived (ADR 0009). It does not trim,
// re-case, coerce, bucket, or deduplicate — the source vocabularies are dirty
// (eight rows carry a date inside `Reply Status`) and cleaning them here would
// destroy the evidence that they are dirty. Canonicalisation happens at READ
// time, where an unrecognised value can be shown verbatim and disclosed.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A cell that MUST carry a value.
 *
 * ⚠️ VALIDATES ON THE TRIMMED VALUE BUT STORES THE RAW ONE. `"  Dana  "` is a
 * present name, so it passes — and it is written to the database with its
 * whitespace intact, because rewriting a value is exactly what ADR 0009
 * forbids. Only `Full Name` and `LinkedIn URL` use this.
 */
function requiredCell(field: string) {
  return z.preprocess(
    (v) => (v === null || v === undefined ? "" : v),
    z.string().refine((s) => s.trim() !== "", `${field} is required`),
  );
}

/**
 * A cell that may be blank.
 *
 * ⚠️ BLANK BECOMES `null`, NEVER `""` AND NEVER `0`. This is the single most
 * load-bearing line in the file. `Next Touch Date` is filled on 2 rows of 1,435
 * and `Meeting Booked (date)` on 8, so absence is the ordinary state of this
 * data — and an empty string would read as a present value the moment anything
 * downstream tested truthiness by length, while a 0 would invent a measurement
 * nobody took. A whitespace-only cell is blank too: a stray space is not data.
 */
const optionalCell = z.preprocess(
  (v) => {
    if (v === null || v === undefined) return null;
    if (typeof v !== "string") return v;
    return v.trim() === "" ? null : v;
  },
  z.union([z.string(), z.null()]),
);

/**
 * The 24 source headers, keyed EXACTLY as the export spells them.
 *
 * ⚠️ A CONTRACT WITH A FILE THIS REPO DOES NOT CONTROL. The spellings carry
 * spaces, parentheses, a slash and a hyphen — `Why They Fit (signal)`,
 * `What Arcbound Offers (tier + hook)`, `Source / Citation`,
 * `Rationale (1-line)`, `Meeting Booked (date)`, `Qualified (ICP)`. One
 * character wrong and that column is missing from every row of every upload.
 * That is caught loudly rather than silently: a header the schema expects and
 * the file lacks is a parse error, never a column of nulls (see `parseOutreachCsv`).
 */
const cellsSchema = z.object({
  "Full Name": requiredCell("Full Name"),
  Title: optionalCell,
  Company: optionalCell,
  "ICP Seg": optionalCell,
  "Why They Fit (signal)": optionalCell,
  "What They Lack": optionalCell,
  "What Arcbound Offers (tier + hook)": optionalCell,
  "Matching Client Archetype": optionalCell,
  "LinkedIn URL": requiredCell("LinkedIn URL"),
  Location: optionalCell,
  "Source / Citation": optionalCell,
  "Rationale (1-line)": optionalCell,
  "LinkedIn Message": optionalCell,
  "Connection Status": optionalCell,
  "Date Sent": optionalCell,
  "Reply Status": optionalCell,
  "Follow-up Count": optionalCell,
  "Last Follow-up Date": optionalCell,
  "Next Touch Date": optionalCell,
  "Meeting Booked (date)": optionalCell,
  Stage: optionalCell,
  Owner: optionalCell,
  Notes: optionalCell,
  "Qualified (ICP)": optionalCell,
});

/**
 * Header → column key.
 *
 * ⚠️ BOTH SIDES ARE COMPILE-CHECKED, WHICH IS WHY THE HEADER STRINGS APPEAR
 * TWICE. Every `c[...]` read is checked against `cellsSchema`'s shape, so a
 * typo'd header here fails `tsc` rather than silently yielding `undefined`; and
 * the annotated `OutreachRow` return means a missing or misspelled column key
 * fails too. The duplication buys a guarantee that a lookup table could not.
 *
 * ⚠️ `follow_up_count` STAYS A STRING. It looks numeric ("0" on 1,320 rows) and
 * the temptation to `Number()` it here is real — but ADR 0009 puts
 * interpretation at read time, and a count that arrives as "1 (voicemail)" must
 * survive to be disclosed rather than become `NaN` or, worse, `0`.
 */
const outreachRowSchema = cellsSchema.transform((c): OutreachRow => ({
  full_name: c["Full Name"],
  title: c.Title,
  company: c.Company,
  icp_seg: c["ICP Seg"],
  why_they_fit: c["Why They Fit (signal)"],
  what_they_lack: c["What They Lack"],
  what_arcbound_offers: c["What Arcbound Offers (tier + hook)"],
  matching_client_archetype: c["Matching Client Archetype"],
  linkedin_url: c["LinkedIn URL"],
  location: c.Location,
  source_citation: c["Source / Citation"],
  rationale: c["Rationale (1-line)"],
  linkedin_message: c["LinkedIn Message"],
  connection_status: c["Connection Status"],
  date_sent: c["Date Sent"],
  reply_status: c["Reply Status"],
  follow_up_count: c["Follow-up Count"],
  last_follow_up_date: c["Last Follow-up Date"],
  next_touch_date: c["Next Touch Date"],
  meeting_booked_date: c["Meeting Booked (date)"],
  stage: c.Stage,
  owner: c.Owner,
  notes: c.Notes,
  qualified_icp: c["Qualified (ICP)"],
}));

/**
 * The expected headers in export order.
 *
 * Derived from the schema rather than restated, so the list a caller diffs
 * against a real export is the same list the parser validates with. JavaScript
 * preserves insertion order for string keys, so this is the source column order.
 */
export const OUTREACH_HEADERS: string[] = Object.keys(cellsSchema.shape);

export type OutreachParseResult =
  | {
      rows: OutreachRow[];
      /**
       * Headers present in the FILE but absent from the schema, verbatim and in
       * file order.
       *
       * ⚠️ THESE COLUMNS ARE STILL NOT STORED — THEY ARE MERELY NO LONGER
       * SILENT. `outreach_prospects` has a fixed shape, so a 25th column has
       * nowhere to go without a schema change. What this list buys is that the
       * person who added it finds out: previously a new column vanished with no
       * error, no warning and no trace, and the upload returned a cheerful
       * success panel. Callers are expected to surface these NON-BLOCKINGLY —
       * an unexpected column must never cost anyone their upload.
       *
       * Empty for the ordinary 24-column export, which is what keeps the notice
       * meaningful rather than a banner nobody reads.
       */
      unknownHeaders: string[];
    }
  | { error: string };

function formatRowError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "The outreach file has an invalid row.";
  const [index, field] = issue.path;
  const where = typeof index === "number" ? `Row ${index + 1}: ` : "";
  const what = field ? `${field} — ` : "";
  return `${where}${what}${issue.message}`;
}

/**
 * Parse one Outreach snapshot CSV.
 *
 * ⚠️ NOTHING HERE DEDUPLICATES, AND NOTHING MAY. The source holds 1,419 distinct
 * LinkedIn URLs across 1,435 rows — genuine duplicate prospects — and every
 * snapshot re-stores every row by design (ADR 0012). Collapsing them would
 * delete real people and understate every count on the dashboard. The database
 * has no unique key on any source column for the same reason.
 *
 * ⚠️ ALL 24 HEADERS ARE REQUIRED EVEN THOUGH 22 VALUES ARE OPTIONAL. A file
 * missing the `Notes` column is not a file with 1,435 blank notes — it is a
 * different export, and accepting it would write a permanent, unexplained gap
 * into that snapshot with no error to trace it back to.
 *
 * ⚠️ AN UNEXPECTED EXTRA COLUMN IS NOT STORED, BUT IT IS NO LONGER SILENT. It
 * comes back in `unknownHeaders` for the caller to surface non-blockingly.
 * Storing it would need a schema change; telling somebody it was ignored does
 * not, and the second is what turns an invisible failure into a visible one.
 */
export function parseOutreachCsv(text: string): OutreachParseResult {
  const result = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: true,
  });

  if (result.errors.length > 0) {
    const first = result.errors[0]!;
    const where = typeof first.row === "number" ? `Row ${first.row + 1}: ` : "";
    return { error: `Couldn't read the CSV — ${where}${first.message}` };
  }

  const fields = result.meta.fields ?? [];
  if (fields.length === 0) return { error: "The CSV has no header row." };

  // Checked BEFORE the rows, because a missing header would otherwise surface as
  // a confusing per-row failure on row 1 of 1,435 — or, for an optional column,
  // as no failure at all.
  const missing = OUTREACH_HEADERS.filter((header) => !fields.includes(header));
  if (missing.length > 0) {
    return {
      error: `The CSV is missing ${missing.length === 1 ? "a required column" : "required columns"}: ${missing.join(", ")}.`,
    };
  }

  if (result.data.length === 0) return { error: "The CSV has no data rows." };

  const parsed = z.array(outreachRowSchema).safeParse(result.data);
  if (!parsed.success) return { error: formatRowError(parsed.error) };

  // Computed AFTER validation so a file that fails outright reports its real
  // problem rather than a distracting note about a column it also happens to
  // have. Missing headers are an ERROR (above); extra ones are a WARNING — two
  // different failures, kept on two different channels.
  //
  // ⚠️ BLANK HEADER NAMES ARE EXCLUDED. papaparse emits a `""` field for a
  // trailing comma in the header row, which is a formatting artefact rather than
  // a column anyone added; reporting it would fire the warning on every file
  // that ends its header line with a comma, and "ignored column: " names nothing
  // a reader could act on.
  const known = new Set(OUTREACH_HEADERS);
  const unknownHeaders = fields.filter((header) => header.trim() !== "" && !known.has(header));

  return { rows: parsed.data, unknownHeaders };
}
