import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import type { Writer, WriterStatus } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Writers registry seam (real). The service face of `public.writers` and its
// four SECURITY DEFINER functions (see supabase/writers-registry.sql).
//
// An exact mirror of `industries.ts`, because a Writer is exactly what an
// Industry is: a row in a small admin-managed vocabulary that Clients point at
// by id. Reads go through a plain `.from().select()` — RLS permits authenticated
// SELECT on the table. Writes go through the RPCs, which are admin-gated inside
// the database; there is no insert, update or delete policy on `writers`, so a
// non-admin has no route to them even with their own Supabase token.
//
// ⚠️ A WRITER IS AN ATTRIBUTION, NOT AN ACCOUNT (D15). This module reads no
// emails, touches `auth.users` nowhere, and has no relationship to `staff.ts`.
// Writer used to be a foreign key onto `auth.users`, which meant recording who
// writes for a Client required issuing that person a login — and under ADR 0013
// every logged-in analyst reads EVERY Client. CONTEXT.md already said a Writer
// "grants no access and withholds none"; the schema had been contradicting it.
//
// ⚠️ THIS MODULE RE-IMPLEMENTS NO DATABASE INVARIANT — the same discipline
// `industries.ts`, `arcbound-services.ts` and `staff.ts` keep. Not the
// case-insensitive uniqueness of names, and above all NOT the rule that a writer
// in use cannot be deleted. It asks and reports the answer verbatim.
//
// ⚠️ AND THERE IS NO `can_delete` TO READ. `writers` has no such function, so
// this seam does not know in advance whether a delete will be refused — and
// deliberately does not find out. Counting Clients per writer here would be a
// second copy of `delete_writer`'s rule computed from an already-stale read: it
// would begin offering deletes the database refuses, or hiding ones it would
// have allowed. The refusal, with its count, is the answer.
// ─────────────────────────────────────────────────────────────────────────────

interface WriterRow {
  id: string;
  name: string;
  status: string;
}

const WRITER_COLUMNS = "id, name, status";

function toWriter(row: WriterRow): Writer {
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
 * Every writer, active and archived, ordered by name.
 *
 * ⚠️ THROWS RATHER THAN RETURNING `[]` ON A FAILED READ, and that is the whole
 * contract this screen is built on. An empty registry is a TRUE statement about
 * Arcbound — nobody has been recorded yet. A failed read is a statement about
 * ArcBase: we do not know. Returning `[]` for both would tell an admin the
 * registry is empty at the moment it might be full and unreachable, and —
 * because names are unique case-insensitively — invite them to recreate people
 * who already exist and collect constraint errors for it.
 *
 * The same rule `listIndustriesAdmin()` and `listStaff()` state. The page
 * catches this and renders "could not be read"; it does not paper over it with
 * an empty list.
 *
 * Unpaged on purpose: this is the list of people who write for Arcbound's
 * clients, nowhere near PostgREST's 1000-row response cap.
 */
export async function listWritersAdmin(): Promise<Writer[]> {
  const supabase = createClient(cookies());
  const { data, error } = await supabase
    .from("writers")
    .select(WRITER_COLUMNS)
    .order("name", { ascending: true });

  if (error) throw new Error(`Failed to list writers: ${error.message}`);
  return ((data ?? []) as WriterRow[]).map(toWriter);
}

/** Add a writer. Returns their id. */
export async function createWriter(name: string): Promise<string> {
  const supabase = createClient(cookies());
  const { data, error } = await supabase.rpc("create_writer", { p_name: name });

  if (error) throw new Error(error.message);
  return data as string;
}

/**
 * Rename a writer.
 *
 * ⚠️ RENAMING IS SAFE HERE, AND THAT IS NOT TRUE OF EVERY NAME IN THIS PRODUCT.
 * Clients reference a writer by `writer_id`, a foreign key — so a rename moves
 * every Client's label at once and re-attributes nothing. Contrast
 * `clients.name`, which the BI view joins scraped posts on by TEXT, and which no
 * write path in this application may touch.
 *
 * This is also the answer to two people sharing a name: names are unique
 * case-insensitively, so a second "Ryan Prior" is refused — and the fix is a
 * human renaming one of them to something tellable apart, which moves no
 * attribution at all.
 */
export async function updateWriter(id: string, name: string): Promise<void> {
  const supabase = createClient(cookies());
  const { error } = await supabase.rpc("update_writer", { p_id: id, p_name: name });

  if (error) throw new Error(error.message);
}

/**
 * Archive or restore a writer — the reversible way to retire one.
 *
 * Archiving stops a writer being offered for new assignments. It does NOT evict
 * the Clients already recorded against them: their `writer_id` is untouched and
 * the client read follows the foreign key, not the status. That is what makes it
 * the right tool when somebody leaves — the history of who wrote for whom stays
 * true.
 */
export async function setWriterStatus(id: string, status: WriterStatus): Promise<void> {
  const supabase = createClient(cookies());
  const { error } = await supabase.rpc("set_writer_status", { p_id: id, p_status: status });

  if (error) throw new Error(error.message);
}

/**
 * Permanently remove a writer — a typo eraser, not a retirement tool.
 *
 * ⚠️ THIS FUNCTION DOES NOT CHECK WHETHER THE DELETE IS ALLOWED. `delete_writer`
 * refuses while any Client is recorded against them, raising `23503` with a
 * message that NAMES THE COUNT, and the foreign key (NO ACTION) refuses
 * independently of that. Every caller surfaces that message unaltered, because
 * the count is the only part of it that tells an admin what to do next.
 */
export async function deleteWriter(id: string): Promise<void> {
  const supabase = createClient(cookies());
  const { error } = await supabase.rpc("delete_writer", { p_id: id });

  if (error) throw new Error(error.message);
}
