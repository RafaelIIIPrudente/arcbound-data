import { cache } from "react";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient as createServerClient } from "@/lib/supabase/server";
import type { Client, ClientListRow, LastUpload, Paginated } from "@/services/types";
import { latestUploadByClient } from "@/services/uploads";

// ─────────────────────────────────────────────────────────────────────────────
// Clients seam (real). Reads/writes the externally-owned public.clients table and
// derives postsCount from the BI view bi.linkedin_post_latest (ADR 0009).
//
// `clients.name` is the ATTRIBUTION KEY the BI name-match join depends on, so the
// Add-Client form guides staff to the exact display name. This external schema has
// no dedup constraint on clients — ArcBase does not fabricate one (a duplicate is
// a UI concern, not a DB error). Clients are immutable (ADR 0007): no update/delete.
// ─────────────────────────────────────────────────────────────────────────────

/** A row of public.clients (no generated types — the shape is known + stable). */
interface ClientRow {
  id: string;
  name: string;
  linkedin_profile_url: string;
  created_at: string;
}

const CLIENT_COLUMNS = "id, name, linkedin_profile_url, created_at";

function toClient(row: ClientRow, postsCount: number | null): Client {
  return {
    id: row.id,
    name: row.name,
    linkedin_url: row.linkedin_profile_url,
    createdAt: row.created_at,
    postsCount,
  };
}

/**
 * Per-client post counts from bi.linkedin_post_latest.
 *
 * ⚠️ Returns `null` when the read FAILS — never an empty map. An empty map is a
 * real answer ("the view attributes no posts to anyone"); returning it for a
 * failed read made a `0` in the Client List mean either "no posts yet" or "the
 * bi read broke", with no way for staff to tell which.
 */
async function fetchPostCounts(supabase: SupabaseClient): Promise<Map<string, number> | null> {
  try {
    const { data, error } = await supabase
      .schema("bi")
      .from("linkedin_post_latest")
      .select("client_id");
    if (error || !data) {
      console.warn(`Failed to load post counts: ${error?.message ?? "no rows returned"}`);
      return null;
    }
    const counts = new Map<string, number>();
    for (const row of data as { client_id: string | null }[]) {
      if (row.client_id) counts.set(row.client_id, (counts.get(row.client_id) ?? 0) + 1);
    }
    return counts;
  } catch (err) {
    console.warn(`Failed to load post counts: ${err instanceof Error ? err.message : String(err)}`);
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

export async function listClients(
  opts: ListClientsOptions = {},
): Promise<Paginated<ClientListRow>> {
  const { q, page = 1, pageSize = 10 } = opts;
  const supabase = createServerClient(cookies());

  // Three independent reads, issued together. Neither the counts nor the latest
  // uploads read anything out of the client select, so none of them needed to
  // wait; all three are joined to the rows in memory below.
  //
  // `latestUploadByClient` is ONE query for every client — reading uploads per
  // row would be an N+1.
  //
  // Error precedence is unchanged: the two helpers swallow their own failures
  // (signalling with `null`), so neither can reject, and the select's error is
  // still the only one that can surface here.
  const [{ data, error }, counts, latestUploads] = await Promise.all([
    supabase.from("clients").select(CLIENT_COLUMNS).order("created_at", { ascending: false }),
    fetchPostCounts(supabase),
    latestUploadByClient(),
  ]);
  if (error) throw new Error(`Failed to load clients: ${error.message}`);

  let clients = ((data ?? []) as ClientRow[]).map((row): ClientListRow => {
    // A failed read means we don't know ANY client's value — `null`/"unavailable",
    // never a fabricated 0 or "never ingested".
    const lastUpload: LastUpload =
      latestUploads === null ? "unavailable" : (latestUploads.get(row.id) ?? null);
    return { ...toClient(row, counts === null ? null : (counts.get(row.id) ?? 0)), lastUpload };
  });

  if (q && q.trim()) {
    const needle = q.trim().toLowerCase();
    clients = clients.filter(
      (c) => c.name.toLowerCase().includes(needle) || c.linkedin_url.toLowerCase().includes(needle),
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

  // Two independent reads, issued together. The count filters on the id
  // ARGUMENT, not on anything the select returns, so it never needed to wait:
  // `clients.id` is a uuid, so the row's id and `id` are the same value, and
  // `getClientReport` already filters this same BI view on the raw route param.
  //
  // Error precedence is unchanged. `countForClient` swallows its own failures
  // and returns 0, so it can never reject — the only error that can surface
  // here is still the select's, with the same message as before.
  const [{ data, error }, postsCount] = await Promise.all([
    supabase.from("clients").select(CLIENT_COLUMNS).eq("id", id).maybeSingle(),
    countForClient(supabase, id),
  ]);

  if (error) throw new Error(`Failed to load client: ${error.message}`);
  if (!data) return null;

  return toClient(data as ClientRow, postsCount);
});

export async function createClient(input: { name: string; linkedin_url: string }): Promise<Client> {
  const supabase = createServerClient(cookies());

  const { data, error } = await supabase
    .from("clients")
    .insert({ name: input.name.trim(), linkedin_profile_url: input.linkedin_url.trim() })
    .select(CLIENT_COLUMNS)
    .single();
  if (error) throw new Error(`Failed to create client: ${error.message}`);

  return toClient(data as ClientRow, 0);
}
