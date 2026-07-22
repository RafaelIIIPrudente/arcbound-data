import Papa from "papaparse";
import { z } from "zod";

import { isConfidentFormat } from "@/lib/post-format";
import type { PostRow } from "@/services/types";

// Pure, environment-agnostic parsing + validation for a scrape (CSV or JSON).
// papaparse handles RFC-4180 quoting (post_content may contain commas, quotes,
// and newlines); a zod schema validates every row. No I/O, no Date.now/random.

// The format vocabulary lives in the dependency-free @/lib/post-format so that
// client components (the Format Review dropdown) don't pull papaparse + zod into
// the browser bundle. Re-exported here so existing import paths keep working.
export {
  FORMAT_CHOICES,
  FORMAT_LABELS,
  FORMATS,
  isConfidentFormat,
  isRecognizedFormat,
  toCanonicalFormat,
} from "@/lib/post-format";

// A required numeric field: coerces "385" → 385, rejects "", null, undefined,
// and non-numeric strings (guards against z.coerce turning "" into 0).
function numeric(field: string) {
  return z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? NaN : v),
    z.coerce.number().refine((n) => Number.isFinite(n), `${field} must be numeric`),
  );
}

// saves is nullable: "", null, and undefined all normalise to null.
const savesSchema = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.union([z.null(), z.coerce.number().refine((n) => Number.isFinite(n), "saves must be numeric")]),
);

export const postRowSchema = z.object({
  linkedin_post_id: z.coerce.string().trim().min(1, "linkedin_post_id is required"),
  urn: z.string().optional(),
  post_url: z.string().optional(),
  analytics_url: z.string().optional(),
  post_name: z.string().optional(),
  post_content: z.string().optional(),
  post_date: z.string().optional(),
  impressions: numeric("impressions"),
  likes: numeric("likes"),
  comments: numeric("comments"),
  reposts: numeric("reposts"),
  engagement_rate: numeric("engagement_rate"),
  saves: savesSchema,
  post_format_type: z.string().optional(),
  scraped_at: z.coerce.string().trim().min(1, "scraped_at is required"),
});

export type ParseResult = { rows: PostRow[] } | { error: string };

function formatRowError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "The scrape has an invalid row.";
  const [index, field] = issue.path;
  const where = typeof index === "number" ? `Row ${index + 1}: ` : "";
  const what = field ? `${field} — ` : "";
  return `${where}${what}${issue.message}`;
}

function validateRows(data: unknown[]): ParseResult {
  const parsed = z.array(postRowSchema).safeParse(data);
  if (!parsed.success) return { error: formatRowError(parsed.error) };
  return { rows: parsed.data };
}

export function parseCsv(text: string): ParseResult {
  const result = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: true,
  });
  if (result.errors.length > 0) {
    const first = result.errors[0]!;
    const where = typeof first.row === "number" ? `Row ${first.row + 1}: ` : "";
    return { error: `Couldn't read the CSV — ${where}${first.message}` };
  }
  if (result.data.length === 0) return { error: "The CSV has no data rows." };
  return validateRows(result.data);
}

export function parseJson(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: "The JSON couldn't be parsed — check the syntax." };
  }
  if (!Array.isArray(data)) return { error: "Expected a JSON array of post metrics." };
  if (data.length === 0) return { error: "The JSON array has no posts." };
  return validateRows(data);
}

/** A new Post needs review whenever its format isn't one we're confident in. */
export function needsFormatReview(row: PostRow): boolean {
  return !isConfidentFormat(row.post_format_type);
}

/** A compact, single-line content snippet for the review list. */
export function buildSnippet(row: PostRow): string {
  const source = (row.post_content ?? row.post_name ?? row.linkedin_post_id)
    .replace(/\s+/g, " ")
    .trim();
  return source.length > 90 ? `${source.slice(0, 90).trimEnd()}…` : source;
}
