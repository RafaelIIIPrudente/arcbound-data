import { cache } from "react";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

import { asPage, readAllPages, type PageReader } from "@/lib/supabase/paged";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { listStaffDirectory } from "@/services/staff";
import type {
  Client,
  ClientIndustry,
  ClientListRow,
  ClientWriter,
  LastUpload,
  Paginated,
} from "@/services/types";
import { latestUploadByClient } from "@/services/uploads";

// ─────────────────────────────────────────────────────────────────────────────
// Clients seam (real). Reads/writes the externally-owned public.clients table and
// derives postsCount from the BI view bi.linkedin_post_latest (ADR 0009).
//
// `clients.name` is the ATTRIBUTION KEY the BI name-match join depends on, so the
// Add-Client form guides staff to the exact display name. This external schema has
// no dedup constraint on clients — ArcBase does not fabricate one (a duplicate is
// a UI concern, not a DB error).
//
// ⚠️ TWO COLUMNS ARE NOW MUTABLE, AND ONLY TWO. `industry_id` and `writer_id` are
// admin-editable through `setClientIndustryWriter` below (S4) — so the older
// reading of ADR 0007, that a Client row never changes after registration, no
// longer holds. What DOES still hold is the half that protects attribution:
// `public.clients` has no UPDATE policy, so nothing can write the table directly,
// and the one SECURITY DEFINER function that can names exactly those two columns.
// `name` and `linkedin_url` remain unreachable BY CONSTRUCTION, not by convention.
// ─────────────────────────────────────────────────────────────────────────────

/** A row of public.clients (no generated types — the shape is known + stable). */
interface ClientRow {
  id: string;
  name: string;
  linkedin_profile_url: string;
  created_at: string;
  /** The embedded industry — an object, or `null` when none is recorded. */
  industry: ClientIndustry | ClientIndustry[] | null;
  writer_id: string | null;
}

/**
 * ⚠️ THE INDUSTRY RIDES ALONG ON THIS SELECT, THE WRITER DOES NOT.
 *
 * `industry:industries(id, name)` is a PostgREST embed over the foreign key, so
 * it costs no extra round-trip and cannot fail on its own — if the select works
 * at all, the industry came with it. The writer cannot be resolved this way:
 * `writer_id` points at `auth.users`, which is not readable by `authenticated`,
 * so its email has to come from the `list_staff_directory()` RPC instead. That
 * asymmetry is the whole reason `ClientWriter` has states `ClientIndustry` does
 * not.
 */
const CLIENT_COLUMNS =
  "id, name, linkedin_profile_url, created_at, writer_id, industry:industries(id, name)";

/**
 * PostgREST returns a many-to-one embed as an OBJECT, but returns an ARRAY when
 * it reads the relationship the other way round. Normalising both is one line;
 * getting it wrong would report "no industry" for every Client on every screen,
 * silently and plausibly, which is exactly the class of failure this seam keeps
 * being bitten by.
 */
function toIndustry(embedded: ClientRow["industry"]): ClientIndustry | null {
  if (!embedded) return null;
  const row = Array.isArray(embedded) ? embedded[0] : embedded;
  return row ? { id: row.id, name: row.name } : null;
}

/**
 * A Client's writer, from the row's `writer_id` and the directory read.
 *
 * ⚠️ FOUR OUTCOMES, AND THE ORDER OF THESE THREE LINES IS THE POINT. `writer_id`
 * is checked FIRST, so "nobody is assigned" — a fact carried by the client row
 * alone — is never downgraded to "we could not find out" just because the
 * directory happened to be unreadable. Only an ASSIGNED writer can be
 * `unavailable`.
 */
function toWriter(writerId: string | null, emails: Map<string, string> | null): ClientWriter {
  if (!writerId) return null;
  if (emails === null) return { status: "unavailable", userId: writerId };
  const email = emails.get(writerId);
  return email
    ? { status: "resolved", userId: writerId, email }
    : { status: "unknown", userId: writerId };
}

function toClient(
  row: ClientRow,
  postsCount: number | null,
  emails: Map<string, string> | null,
): Client {
  return {
    id: row.id,
    name: row.name,
    linkedin_url: row.linkedin_profile_url,
    createdAt: row.created_at,
    postsCount,
    industry: toIndustry(row.industry),
    writer: toWriter(row.writer_id, emails),
  };
}

/**
 * Staff emails by user id, or `null` when the directory read FAILED.
 *
 * ⚠️ THIS FUNCTION MUST NEVER THROW, AND THE REASON IS NOT IN THIS FILE.
 * `getClient` is no longer only a display read: the upload name-match gate calls
 * it before every write, and `checkAuthorNames` CATCHES ITS THROW and degrades
 * to `{ status: "unchecked" }` — letting the upload proceed without the check
 * that exists because fourteen posts were lost to a name mismatch. So a reader
 * that can reject would not surface here as an error anybody sees; it would
 * silently switch that gate off, on exactly the days the database is unwell.
 *
 * Hence the same contract `fetchPostCounts` and `latestUploadByClient` already
 * follow: swallow the failure, signal it with `null`, and let `toWriter` turn
 * that into a writer state a screen can be honest about.
 */
async function staffEmailsById(): Promise<Map<string, string> | null> {
  try {
    const directory = await listStaffDirectory();
    return new Map(directory.map((entry) => [entry.userId, entry.email]));
  } catch (err) {
    console.warn(
      `Failed to load the staff directory: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Per-client post counts from bi.linkedin_post_latest.
 *
 * ⚠️ Returns `null` when the read FAILS — never an empty map. An empty map is a
 * real answer ("the view attributes no posts to anyone"); returning it for a
 * failed read made a `0` in the Client List mean either "no posts yet" or "the
 * bi read broke", with no way for staff to tell which.
 *
 * ⚠️ AND `null` WHEN THE READ IS TRUNCATED, for the same reason. This read was
 * once unpaged, so above PostgREST's 1000-row cap it returned a short response
 * and a 200 — every count on the Client List quietly understated, while the
 * client DETAIL page stayed right because it uses `count: "exact", head: true`.
 * Two screens disagreeing, neither saying so.
 *
 * Paging fixes that up to MAX_PAGES. Past it the rows are a PREFIX, so a count
 * built from them is wrong while looking entirely plausible — and a plausible
 * wrong number is worse than an em dash. Never return partial counts.
 */
async function fetchPostCounts(supabase: SupabaseClient): Promise<Map<string, number> | null> {
  const { rows, unavailable, truncated } = await readAllPages<{ client_id: string | null }>(
    (from, to, opts) =>
      asPage<{ client_id: string | null }>(
        supabase
          .schema("bi")
          .from("linkedin_post_latest")
          .select("client_id", opts)
          // Stable ordering — CONCURRENT ranges can otherwise overlap or skip
          // rows. Ordering by a column that is not selected is fine.
          .order("linkedin_post_id", { ascending: true })
          .range(from, to),
      ),
    "bi.linkedin_post_latest",
  );
  if (unavailable || truncated) return null;

  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.client_id) counts.set(row.client_id, (counts.get(row.client_id) ?? 0) + 1);
  }
  return counts;
}

/**
 * The client roster — id and name only.
 *
 * ⚠️ DELIBERATELY NOT `listClients`. That function joins a post count from a
 * SECOND, independent bi read; a caller that also reads the posts itself would
 * end up with two counts of the same thing, which is precisely how one screen
 * comes to contradict another. This returns the roster and nothing else, so the
 * caller derives every figure from the single read it already owns.
 *
 * Unpaged on purpose: ArcBase tracks dozens of individual LinkedIn profiles, not
 * thousands, and `clients` is nowhere near the 1000-row response cap.
 */
export async function listClientRegistry(): Promise<{ id: string; name: string }[] | null> {
  try {
    const supabase = createServerClient(cookies());
    const { data, error } = await supabase
      .from("clients")
      .select("id, name")
      .order("name", { ascending: true });
    if (error) {
      console.warn(`Failed to load the client registry: ${error.message}`);
      return null;
    }
    return (data ?? []) as { id: string; name: string }[];
  } catch (err) {
    console.warn(
      `Failed to load the client registry: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/** One client's post count, or `null` when the read failed (see `fetchPostCounts`). */
async function countForClient(supabase: SupabaseClient, clientId: string): Promise<number | null> {
  try {
    const { count, error } = await supabase
      .schema("bi")
      .from("linkedin_post_latest")
      .select("*", { count: "exact", head: true })
      .eq("client_id", clientId);
    if (error || count == null) {
      console.warn(
        `Failed to count posts for client ${clientId}: ${error?.message ?? "no count returned"}`,
      );
      return null;
    }
    return count;
  } catch (err) {
    console.warn(
      `Failed to count posts for client ${clientId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

export interface ListClientsOptions {
  q?: string;
  page?: number;
  pageSize?: number;
}

/**
 * A `PageReader` over `public.clients`, newest first.
 *
 * ⚠️ THIS READ WAS UNPAGED, AND THAT WAS WORSE THAN A SHORT ANSWER: `listClients`
 * paginates IN MEMORY with `.slice()`, so above PostgREST's 1000-row cap page 2
 * of the Clients screen was built from a set that never contained page 2's rows.
 * The screen reported a total it could not show the rows for.
 *
 * ⚠️ THE `id` TIEBREAK IS LOAD-BEARING. `created_at` alone is not a total order —
 * clients created in one transaction share a timestamp — and pages 1..n are
 * issued CONCURRENTLY, so an ambiguous sort lets the database return a row twice
 * across two ranges, or not at all. `id` is the primary key, so it is unique by
 * definition and makes the order total.
 *
 * `failure` captures the database's own message, which `readAllPages` otherwise
 * only writes to a console warning — this seam throws with it.
 */
function clientPageReader(
  supabase: SupabaseClient,
  failure: { message: string | null },
): PageReader<ClientRow> {
  return async (from, to, opts) => {
    const page = await asPage<ClientRow>(
      supabase
        .from("clients")
        .select(CLIENT_COLUMNS, opts)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to),
    );
    if (page.error && failure.message === null) failure.message = page.error.message;
    return page;
  };
}

export async function listClients(
  opts: ListClientsOptions = {},
): Promise<Paginated<ClientListRow>> {
  const { q, page = 1, pageSize = 10 } = opts;
  const supabase = createServerClient(cookies());

  // Four independent reads, issued together. None of the counts, the latest
  // uploads or the staff directory reads anything out of the client select, so
  // none of them needed to wait; all four are joined to the rows in memory below.
  //
  // `latestUploadByClient` is ONE query for every client — reading uploads per
  // row would be an N+1 — and `staffEmailsById` is ONE read for the whole page
  // for the same reason. The directory is the staff roster, not a per-client
  // resource; there is nothing to fetch a second time.
  //
  // Error precedence is unchanged: the three helpers swallow their own failures
  // (signalling with `null`), so none can reject, and the select's error is
  // still the only one that can surface here.
  // `readAllPages` reports THAT a read failed, not WHY. This seam's contract is
  // to throw with the database's own message, so the reader keeps the first one
  // it sees rather than losing it to a console warning.
  const failure: { message: string | null } = { message: null };

  const [clientsRead, counts, latestUploads, writerEmails] = await Promise.all([
    readAllPages(clientPageReader(supabase, failure), "public.clients"),
    fetchPostCounts(supabase),
    latestUploadByClient(),
    staffEmailsById(),
  ]);
  if (clientsRead.unavailable) {
    throw new Error(`Failed to load clients: ${failure.message ?? "read failed"}`);
  }

  let clients = clientsRead.rows.map((row): ClientListRow => {
    // A failed read means we don't know ANY client's value — `null`/"unavailable",
    // never a fabricated 0 or "never ingested".
    const lastUpload: LastUpload =
      latestUploads === null ? "unavailable" : (latestUploads.get(row.id) ?? null);
    return {
      ...toClient(row, counts === null ? null : (counts.get(row.id) ?? 0), writerEmails),
      lastUpload,
    };
  });

  if (q && q.trim()) {
    const needle = q.trim().toLowerCase();
    // ⚠️ THE INDUSTRY NAME IS PART OF THE HAYSTACK, AND THAT IS WHAT MAKES "HOW
    // MANY CLIENTS IN SaaS" ANSWERABLE (D6). The Client List prints `total` as
    // its count, so filtering to an industry IS the count — a column that only
    // displayed the industry would leave the reader tallying rows by eye.
    //
    // The WRITER is deliberately NOT searched here: `q` is written into the URL,
    // and a shareable link is not the place for a colleague's email address. The
    // Writer column sorts, which answers "which clients are mine" without
    // putting anyone's address in a query string.
    clients = clients.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        c.linkedin_url.toLowerCase().includes(needle) ||
        (c.industry?.name.toLowerCase().includes(needle) ?? false),
    );
  }

  const total = clients.length;
  const start = (page - 1) * pageSize;
  return { items: clients.slice(start, start + pageSize), total };
}

/**
 * One client by id, or `null`.
 *
 * MEMOISED PER REQUEST, keyed by `id`. React's `cache()` is REQUEST-scoped: the
 * memo lives for one server render and is discarded with it, so one visitor's
 * RLS-authorised read can never be served to another.
 *
 * ⚠️ Today this DEDUPES NOTHING — every call site reads a client exactly once
 * per request (there is no `generateMetadata` to double the read). It is a guard
 * on a cheap read, not a fix for measured duplicate work: the moment a second
 * component on the same page needs the client, it costs one round-trip instead
 * of two, and nobody has to notice.
 *
 * This must NOT be swapped for `unstable_cache` or anything that persists
 * BETWEEN requests. That would move an RLS-enforced boundary out of the database
 * and into application code, and it throws outright here anyway — the read is
 * cookie-bound via `createServerClient(cookies())`.
 */
export const getClient = cache(async (id: string): Promise<Client | null> => {
  const supabase = createServerClient(cookies());

  // Three independent reads, issued together. Neither the count nor the staff
  // directory reads anything out of the select, so neither needed to wait: the
  // count filters on the id ARGUMENT (`clients.id` is a uuid, so the row's id
  // and `id` are the same value, and `getClientReport` already filters this same
  // BI view on the raw route param), and the directory is the whole staff
  // roster, which does not depend on this client at all.
  //
  // ⚠️ ERROR PRECEDENCE IS UNCHANGED, AND HERE THAT IS A SAFETY PROPERTY RATHER
  // THAN TIDINESS. `countForClient` and `staffEmailsById` both swallow their own
  // failures, so neither can reject — the only error that can surface from this
  // function is still the select's, with the same message as before. The upload
  // name-match gate calls `getClient` and treats ANY throw as "could not check",
  // proceeding with the write; a directory that could reject would therefore
  // turn that gate off without a word on screen.
  const [{ data, error }, postsCount, writerEmails] = await Promise.all([
    supabase.from("clients").select(CLIENT_COLUMNS).eq("id", id).maybeSingle(),
    countForClient(supabase, id),
    staffEmailsById(),
  ]);

  if (error) throw new Error(`Failed to load client: ${error.message}`);
  if (!data) return null;

  return toClient(data as ClientRow, postsCount, writerEmails);
});

export async function createClient(input: {
  name: string;
  linkedin_url: string;
  /** Optional at registration — `null`/absent means "not recorded", not "none". */
  industry_id?: string | null;
  writer_id?: string | null;
}): Promise<Client> {
  const supabase = createServerClient(cookies());

  // ⚠️ ONE STATEMENT, FOUR COLUMNS — NOT A SECOND WRITE (D7). RLS gates ROWS, not
  // columns, so the "arcbase add clients" policy (`with check public.is_admin()`)
  // guards these two exactly as tightly as `set_client_industry_writer` would.
  // The deciding reason is failure states: registering a Client is already two
  // writes with a four-outcome result including `created_services_failed` — "the
  // Client EXISTS but is broken on arrival, and retrying would duplicate it". A
  // separate industry/writer write would add another such outcome. Folding both
  // into the insert adds none.
  const { data, error } = await supabase
    .from("clients")
    .insert({
      name: input.name.trim(),
      linkedin_profile_url: input.linkedin_url.trim(),
      industry_id: input.industry_id ?? null,
      writer_id: input.writer_id ?? null,
    })
    .select(CLIENT_COLUMNS)
    .single();
  if (error) throw new Error(`Failed to create client: ${error.message}`);

  const row = data as ClientRow;

  // ⚠️ THE DIRECTORY IS READ ONLY WHEN A WRITER WAS ACTUALLY SET, and skipping it
  // otherwise is not an optimisation — it is what keeps this return honest.
  //
  // This used to pass an empty map unconditionally, and said so: the insert set
  // neither column, so there was no id to look up. That reasoning died with the
  // line above. Against an empty map `toWriter` resolves an assigned writer to
  // `unknown` — which in this codebase means "assigned to an id no staff account
  // matches, a human must reassign". Reporting that about a writer the admin just
  // successfully assigned would be a false alarm manufactured by this function.
  //
  // `staffEmailsById` never throws; it signals a failed read with `null`, which
  // `toWriter` turns into `unavailable` — "we do not know", which is true. So the
  // one state this can never now produce is the one that would have been a lie.
  const emails = row.writer_id ? await staffEmailsById() : new Map<string, string>();

  return toClient(row, 0, emails);
}

/**
 * Set a Client's Industry and Writer — the ONLY write path onto an existing
 * `public.clients` row, and admin-only twice over (`requireAdmin()` in the action,
 * `is_admin()` inside the function, raising 42501).
 *
 * ⚠️ BOTH ARGUMENTS ARE APPLIED, INCLUDING NULL. THERE IS NO PARTIAL UPDATE.
 * Passing `null` CLEARS the column — that is how "not recorded" is expressed — so
 * every caller must send the CURRENT value of the field it is not changing.
 * `supabase/client-industry-writer.sql` states this outright: *"a partial update
 * is impossible through this signature, on purpose."* A form that posts only the
 * field the admin touched erases the other one, with no error and no trace.
 *
 * ⚠️ IT LIVES HERE, IN THE `clients` SEAM, BECAUSE IT WRITES `public.clients`.
 * `industries.ts` owns the registry; this owns the table whose read path
 * (`CLIENT_COLUMNS`, `toIndustry`, `toWriter`) has to agree with what this wrote.
 *
 * ⚠️ AN ARCHIVED INDUSTRY IS ACCEPTED, DELIBERATELY — the SQL decided that, and
 * refusing one here would mean a Client whose industry was archived after
 * assignment could never have its writer changed again. See the picker in
 * `client-industry-writer-card.tsx`, which must OFFER the current value for the
 * same reason.
 */
export async function setClientIndustryWriter(
  clientId: string,
  industryId: string | null,
  writerId: string | null,
): Promise<void> {
  const supabase = createServerClient(cookies());
  const { error } = await supabase.rpc("set_client_industry_writer", {
    p_client_id: clientId,
    p_industry_id: industryId,
    p_writer_id: writerId,
  });

  // Verbatim. `set_client_industry_writer` writes its refusals itself ('admin role
  // required', 'unknown client %'), and the app deliberately does not predict them.
  if (error) throw new Error(error.message);
}
