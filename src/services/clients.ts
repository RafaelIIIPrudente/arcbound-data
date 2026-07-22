import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient as createServerClient } from "@/lib/supabase/server";
import type { Client, Paginated } from "@/services/types";

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

function toClient(row: ClientRow, postsCount: number): Client {
  return {
    id: row.id,
    name: row.name,
    linkedin_url: row.linkedin_profile_url,
    createdAt: row.created_at,
    postsCount,
  };
}

// Per-client post counts from bi.linkedin_post_latest. Best-effort: if the `bi`
// schema isn't exposed to the API yet (see supabase/INGEST-WRITE-APPLY.md), fall
// back to 0 rather than failing the whole list.
async function fetchPostCounts(supabase: SupabaseClient): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  try {
    const { data, error } = await supabase
      .schema("bi")
      .from("linkedin_post_latest")
      .select("client_id");
    if (error || !data) return counts;
    for (const row of data as { client_id: string | null }[]) {
      if (row.client_id) counts.set(row.client_id, (counts.get(row.client_id) ?? 0) + 1);
    }
  } catch {
    // bi schema unreachable → treat every count as 0 (best-effort).
  }
  return counts;
}

async function countForClient(supabase: SupabaseClient, clientId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .schema("bi")
      .from("linkedin_post_latest")
      .select("*", { count: "exact", head: true })
      .eq("client_id", clientId);
    if (error || count == null) return 0;
    return count;
  } catch {
    return 0;
  }
}

export interface ListClientsOptions {
  q?: string;
  page?: number;
  pageSize?: number;
}

export async function listClients(opts: ListClientsOptions = {}): Promise<Paginated<Client>> {
  const { q, page = 1, pageSize = 10 } = opts;
  const supabase = createServerClient(cookies());

  const { data, error } = await supabase
    .from("clients")
    .select(CLIENT_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load clients: ${error.message}`);

  const counts = await fetchPostCounts(supabase);
  let clients = ((data ?? []) as ClientRow[]).map((row) => toClient(row, counts.get(row.id) ?? 0));

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

export async function getClient(id: string): Promise<Client | null> {
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
}

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
