import { cache } from "react";
import { cookies } from "next/headers";

import { asPage, readAllPages, type PageReader } from "@/lib/supabase/paged";
import { createClient } from "@/lib/supabase/server";
import type { ArcboundService, ClientServiceAssignment, ServiceHandler } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Arcbound Services seam (real). The service face of `public.services`,
// `public.client_services` and their six SECURITY DEFINER functions (see
// supabase/arcbound-services.sql and ADR 0015).
//
// ⚠️ THE FILE IS `arcbound-services.ts`, NOT `services.ts`, AND THAT IS NOT
// COSMETIC. `src/services/` IS the Service Seam — the UI↔data boundary defined in
// CONTEXT.md. A module called `src/services/services.ts` would name two different
// concepts with one word at every import site. This repo already carries one
// unresolved collision of exactly that kind (Engineer/Admin vs the Admin Staff
// Role); a second is not worth the four characters saved.
//
// Reads go through plain `.from().select()` — RLS already permits authenticated
// SELECT on both tables. Writes go through the RPCs, which are admin-gated inside
// the database; there is no write policy on either table, so a non-admin has no
// route to them even with their own Supabase token.
//
// ⚠️ THIS MODULE RE-IMPLEMENTS NO DATABASE INVARIANT. Not the delete guard, not
// the one-Service-per-handler rule, not the handler's immutability. It asks and
// reports. A second copy of a rule drifts from the first, and the copy users see
// is the one that drifts first — the same discipline `staff.ts` keeps around the
// last-admin rule.
// ─────────────────────────────────────────────────────────────────────────────

interface ServiceRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  handler: string | null;
  status: string;
  sort_order: number;
}

interface ClientServiceRow {
  client_id: string;
  service_id: string;
  created_at: string;
  created_by: string | null;
}

/** The admin registry view: a Service plus what currently depends on it. */
export interface ArcboundServiceAdminRow extends ArcboundService {
  /** How many Clients receive this Service. */
  clientCount: number;
  /**
   * Uploads that arrived through this Service's pipeline.
   *
   * ⚠️ DERIVED FROM THE HANDLER, NOT FROM A JOIN — neither uploads table carries a
   * `service_id`. A Service with no handler reports 0, and that 0 is a fact about
   * the offering rather than a missing relationship.
   */
  uploadCount: number;
  /** Mirrors `delete_service`'s rule; the database still refuses independently. */
  canDelete: boolean;
}

const SERVICE_COLUMNS = "id, slug, name, description, handler, status, sort_order";

function toService(row: ServiceRow): ArcboundService {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    // ⚠️ `null` SURVIVES THE MAPPING. It means "a listed offering with no
    // ingestion pipeline" — a real state, not an error and not missing data.
    // The CHECK constraint guarantees any non-null value is one we implement.
    handler: (row.handler as ServiceHandler | null) ?? null,
    status: row.status === "archived" ? "archived" : "active",
    sortOrder: row.sort_order,
  };
}

/**
 * Every Service in the registry, active and archived, in display order.
 *
 * Throws rather than returning `[]` on a failed read: an empty registry reads as
 * "Arcbound sells nothing", which a caller cannot tell apart from a broken query.
 */
export async function listServices(): Promise<ArcboundService[]> {
  const supabase = createClient(cookies());
  const { data, error } = await supabase
    .from("services")
    .select(SERVICE_COLUMNS)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Failed to list services: ${error.message}`);
  return ((data ?? []) as ServiceRow[]).map(toService);
}

const CLIENT_SERVICE_COLUMNS = "client_id, service_id, created_at, created_by";

function toAssignment(row: ClientServiceRow): ClientServiceAssignment {
  return {
    clientId: row.client_id,
    serviceId: row.service_id,
    createdAt: row.created_at,
    // `null` means the backfill wrote it from upload history rather than a person
    // choosing it. Preserved, never defaulted to a user id.
    createdBy: row.created_by,
  };
}

/** The Services one Client receives. */
export async function listClientServices(clientId: string): Promise<ClientServiceAssignment[]> {
  const supabase = createClient(cookies());
  const { data, error } = await supabase
    .from("client_services")
    .select(CLIENT_SERVICE_COLUMNS)
    .eq("client_id", clientId);

  if (error) throw new Error(`Failed to list client services: ${error.message}`);

  return ((data ?? []) as ClientServiceRow[]).map(toAssignment);
}

/** The registry plus one Client's slice of it — what the tabs and the Overview both need. */
export interface ClientServiceAccess {
  /**
   * EVERY Service in the registry, active and archived. `ClientServicesCard` on
   * the Overview needs this full list — to offer new assignments and to keep
   * rendering a held-but-archived Service — not just what is currently held.
   */
  services: ArcboundService[];
  /**
   * The Services this Client is actually assigned. This is what `canSee()` and
   * `visibleTabServices()` (`src/lib/service-access.ts`) operate on: an ARCHIVED
   * Service still appears here if held (D11), and a NULL-handler Service still
   * appears here too — it grants no section, but it is a real assignment.
   */
  held: ArcboundService[];
}

/**
 * The registry and this Client's slice of it — BOTH reads or NEITHER.
 *
 * ⚠️ `null` MEANS "COULD NOT BE READ"; `{ services: [...], held: [] }` MEANS
 * "READ, AND ASSIGNED NOTHING". NEVER COLLAPSE THEM. Every gated page and the tab
 * strip turn on this difference: `canSee(null, …)` answers `true` to everything
 * (fail OPEN — an unreadable registry must not silently strip access), while
 * `canSee([], …)` answers `false` (a real, correct "not assigned"). Returning `[]`
 * here for a failed read would make every database hiccup look exactly like every
 * Client having no Services at once.
 *
 * ⚠️ THIS IS THE LIVE PATH TODAY. `supabase/arcbound-services.sql` is not applied,
 * so both reads below throw on every request against the real database, and every
 * Client's tabs and gated pages run on the `null` branch until it is.
 *
 * ⚠️ MEMOISED WITH REACT `cache()` — REQUEST-SCOPED ONLY, NEVER `unstable_cache`.
 * Same reasoning as `getClient` in `src/services/clients.ts`: the read is
 * cookie-bound and RLS-enforced (via `listServices`/`listClientServices`'s own
 * Supabase client). `unstable_cache` persists BETWEEN requests, which would move
 * that RLS boundary out of the database and into application code — one visitor's
 * Client-Service assignment could then be served to another. `cache()` costs
 * nothing extra when only one caller on a page needs it, and saves a round trip
 * the moment a second one does — `ClientTabs` and the Overview page both call this
 * for the same Client on the same render.
 */
export const getClientServices = cache(
  async (clientId: string): Promise<ClientServiceAccess | null> => {
    try {
      const [services, assigned] = await Promise.all([
        listServices(),
        listClientServices(clientId),
      ]);
      const heldIds = new Set(assigned.map((row) => row.serviceId));
      const held = services.filter((service) => heldIds.has(service.id));
      return { services, held };
    } catch {
      return null;
    }
  },
);

/**
 * A `PageReader` over the whole `client_services` table.
 *
 * ⚠️ THE ORDER MUST BE TOTAL, AND `(client_id, service_id)` IS THE PRIMARY KEY.
 * Pages 1..n are issued CONCURRENTLY, so without a total order the database may
 * return overlapping or skipped rows across ranges — a silently wrong row set
 * rather than an error. Ordering by `client_id` alone is NOT total: many rows
 * share one.
 */
function clientServicePageReader(): PageReader<ClientServiceRow> {
  let supabase: ReturnType<typeof createClient> | undefined;
  return (from, to, opts) => {
    supabase ??= createClient(cookies());
    return asPage<ClientServiceRow>(
      supabase
        .from("client_services")
        .select(CLIENT_SERVICE_COLUMNS, opts)
        .order("client_id", { ascending: true })
        .order("service_id", { ascending: true })
        .range(from, to),
    );
  };
}

/**
 * EVERY Client's Service assignments, in one paged read.
 *
 * ⚠️ PAGED, BECAUSE POSTGREST'S 1000-ROW CAP WOULD BE A SILENT TRUNCATION HERE —
 * AND SILENT TRUNCATION READS AS "THIS CLIENT CANNOT UPLOAD".
 *
 * `/upload` derives a Client's tabs from these rows. A Client whose assignments
 * fell off the end of an unpaged read would arrive holding zero Services, and the
 * screen would state — plainly, and wrongly — that they have none and cannot
 * receive uploads. No error would appear anywhere. `readAllPages` gives 50 pages
 * × 1000 rows = **50,000 rows** of headroom against a table that holds one row per
 * (Client × Service): roughly 150 rows today, so the cap is ~330× away.
 *
 * ⚠️ TRUNCATION THROWS RATHER THAN RETURNING A PREFIX. If the ceiling were ever
 * reached, a partial set is worse than no set: it would strip SOME clients of
 * their upload path while looking completely normal. Throwing sends the page to
 * its registry-unreadable fallback, which shows every pipeline tab — over-showing
 * is recoverable, silently removing someone's ability to work is not.
 */
export async function listAllClientServices(): Promise<ClientServiceAssignment[]> {
  const read = await readAllPages<ClientServiceRow>(
    clientServicePageReader(),
    "public.client_services",
  );

  if (read.unavailable) {
    throw new Error("Service assignments could not be read.");
  }
  if (read.truncated) {
    throw new Error(
      `Service assignments are incomplete: read ${read.rows.length} of ${read.total ?? "unknown"} rows.`,
    );
  }

  return read.rows.map(toAssignment);
}

/** The admin registry, with per-Service counts. Admin-only in the database. */
export async function listServicesAdmin(): Promise<ArcboundServiceAdminRow[]> {
  const supabase = createClient(cookies());
  const { data, error } = await supabase.rpc("list_services_admin");

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as (ServiceRow & {
    client_count: number;
    upload_count: number;
    can_delete: boolean;
  })[];

  return rows.map((row) => ({
    ...toService(row),
    clientCount: Number(row.client_count),
    uploadCount: Number(row.upload_count),
    canDelete: row.can_delete,
  }));
}

export interface CreateServiceInput {
  name: string;
  slug: string;
  description: string | null;
  handler: ServiceHandler | null;
}

/** Register a new offering. Returns its id. */
export async function createService(input: CreateServiceInput): Promise<string> {
  const supabase = createClient(cookies());
  const { data, error } = await supabase.rpc("create_service", {
    p_name: input.name,
    p_slug: input.slug,
    p_description: input.description,
    p_handler: input.handler,
  });

  if (error) throw new Error(error.message);
  return data as string;
}

export interface UpdateServiceInput {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
}

/**
 * Rename / re-describe / re-order an offering.
 *
 * ⚠️ THERE IS DELIBERATELY NO `handler` HERE. It is set at creation and immutable:
 * repointing a live Service at another pipeline would silently reinterpret every
 * engagement already attached to it, changing what historical counts mean with
 * nothing to show it happened. To change a pipeline, archive and create anew.
 */
export async function updateService(input: UpdateServiceInput): Promise<void> {
  const supabase = createClient(cookies());
  const { error } = await supabase.rpc("update_service", {
    p_id: input.id,
    p_name: input.name,
    p_description: input.description,
    p_sort_order: input.sortOrder,
  });

  if (error) throw new Error(error.message);
}

/** Archive or restore an offering. The reversible way to retire one. */
export async function setServiceStatus(
  id: string,
  status: ArcboundService["status"],
): Promise<void> {
  const supabase = createClient(cookies());
  const { error } = await supabase.rpc("set_service_status", { p_id: id, p_status: status });

  if (error) throw new Error(error.message);
}

/**
 * Permanently remove an offering — a typo eraser, not a retirement tool.
 *
 * ⚠️ THIS FUNCTION DOES NOT CHECK WHETHER THE DELETE IS ALLOWED. `delete_service`
 * refuses while any Client receives it, and the foreign key refuses independently
 * of that. Counting engagements here first would be a second copy of the rule,
 * computed from an already-stale read — and it would drift. The message this
 * surfaces names the real count, which is the only reason it is useful.
 */
export async function deleteService(id: string): Promise<void> {
  const supabase = createClient(cookies());
  const { error } = await supabase.rpc("delete_service", { p_id: id });

  if (error) throw new Error(error.message);
}

/** Replace the whole Service set for one Client. Idempotent. */
export async function setClientServices(clientId: string, serviceIds: string[]): Promise<void> {
  const supabase = createClient(cookies());
  const { error } = await supabase.rpc("set_client_services", {
    p_client_id: clientId,
    p_service_ids: serviceIds,
  });

  if (error) throw new Error(error.message);
}
