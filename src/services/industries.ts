import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import type { Industry, IndustryStatus } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Industries registry seam (real). The service face of `public.industries` and
// its four SECURITY DEFINER functions (see supabase/client-industry-writer.sql).
//
// Reads go through a plain `.from().select()` — RLS permits authenticated SELECT
// on the table. Writes go through the RPCs, which are admin-gated inside the
// database; there is no insert, update or delete policy on `industries`, so a
// non-admin has no route to them even with their own Supabase token.
//
// ⚠️ THIS MODULE RE-IMPLEMENTS NO DATABASE INVARIANT — the same discipline
// `arcbound-services.ts` and `staff.ts` keep. Not the case-insensitive
// uniqueness of names, and above all NOT the rule that an industry in use cannot
// be deleted. It asks and reports the answer verbatim.
//
// ⚠️ AND UNLIKE `listServicesAdmin`, THERE IS NO `can_delete` TO READ. The
// Services registry gets that flag from its admin RPC; `industries` has no such
// function, so this seam does not know in advance whether a delete will be
// refused — and deliberately does not find out. Counting Clients per industry
// here would be a second copy of `delete_industry`'s rule computed from an
// already-stale read: it would begin offering deletes the database refuses, or
// hiding ones it would have allowed. The refusal, with its count, is the answer.
// ─────────────────────────────────────────────────────────────────────────────

interface IndustryRow {
  id: string;
  name: string;
  status: string;
}

const INDUSTRY_COLUMNS = "id, name, status";

function toIndustry(row: IndustryRow): Industry {
  return {
    id: row.id,
    name: row.name,
    // The CHECK constraint permits only these two, and the column is NOT NULL
    // with a default; anything else would be a database that has changed under
    // us, and 'active' is the safer reading — it keeps the row visible and
    // editable rather than hiding it in a state the screen cannot leave.
    status: row.status === "archived" ? "archived" : "active",
  };
}

/**
 * Every industry, active and archived, ordered by name.
 *
 * ⚠️ THROWS RATHER THAN RETURNING `[]` ON A FAILED READ, and that is the whole
 * contract this screen is built on. An empty registry is a TRUE statement about
 * Arcbound — nothing has been recorded yet, which is exactly the state today.
 * A failed read is a statement about ArcBase: we do not know. Returning `[]` for
 * both would tell an admin the registry is empty at the moment it might be full
 * and unreachable, and — because names are unique case-insensitively — invite
 * them to recreate rows that already exist and collect constraint errors for it.
 *
 * The same rule `listStaff()` states in `staff.ts`. The page catches this and
 * renders "could not be read"; it does not paper over it with an empty list.
 *
 * Unpaged on purpose: this is a hand-curated vocabulary of industries, nowhere
 * near PostgREST's 1000-row response cap.
 */
export async function listIndustriesAdmin(): Promise<Industry[]> {
  const supabase = createClient(cookies());
  const { data, error } = await supabase
    .from("industries")
    .select(INDUSTRY_COLUMNS)
    .order("name", { ascending: true });

  if (error) throw new Error(`Failed to list industries: ${error.message}`);
  return ((data ?? []) as IndustryRow[]).map(toIndustry);
}

/** Add an industry. Returns its id. */
export async function createIndustry(name: string): Promise<string> {
  const supabase = createClient(cookies());
  const { data, error } = await supabase.rpc("create_industry", { p_name: name });

  if (error) throw new Error(error.message);
  return data as string;
}

/**
 * Rename an industry.
 *
 * ⚠️ RENAMING IS SAFE HERE, AND THAT IS NOT TRUE OF EVERY NAME IN THIS PRODUCT.
 * Clients reference an industry by `industry_id`, a foreign key — so a rename
 * moves every Client's label at once and re-attributes nothing. Contrast
 * `clients.name`, which the BI view joins scraped posts on by TEXT, and which no
 * write path in this application may touch.
 */
export async function updateIndustry(id: string, name: string): Promise<void> {
  const supabase = createClient(cookies());
  const { error } = await supabase.rpc("update_industry", { p_id: id, p_name: name });

  if (error) throw new Error(error.message);
}

/**
 * Archive or restore an industry — the reversible way to retire one.
 *
 * Archiving stops an industry being offered for new assignments. It does NOT
 * evict the Clients already recorded in it: their `industry_id` is untouched and
 * the client read follows the foreign key, not the status.
 */
export async function setIndustryStatus(id: string, status: IndustryStatus): Promise<void> {
  const supabase = createClient(cookies());
  const { error } = await supabase.rpc("set_industry_status", { p_id: id, p_status: status });

  if (error) throw new Error(error.message);
}

/**
 * Permanently remove an industry — a typo eraser, not a retirement tool.
 *
 * ⚠️ THIS FUNCTION DOES NOT CHECK WHETHER THE DELETE IS ALLOWED. `delete_industry`
 * refuses while any Client is recorded in the industry, raising `23503` with a
 * message that NAMES THE COUNT, and the foreign key (no cascade) refuses
 * independently of that. Every caller above surfaces that message unaltered,
 * because the count is the only part of it that tells an admin what to do next.
 */
export async function deleteIndustry(id: string): Promise<void> {
  const supabase = createClient(cookies());
  const { error } = await supabase.rpc("delete_industry", { p_id: id });

  if (error) throw new Error(error.message);
}
