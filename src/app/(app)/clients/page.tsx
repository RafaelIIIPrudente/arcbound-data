import type { Metadata } from "next";

import { AddClientDialog } from "@/components/dashboard/client/add-client-dialog";
import { ClientsTable } from "@/components/dashboard/client/clients-table";
import { getRole, isAdmin } from "@/lib/auth/roles";
import { listServices } from "@/services/arcbound-services";
import { listClients } from "@/services/clients";
import { listIndustriesAdmin } from "@/services/industries";
import { listStaffDirectory } from "@/services/staff";

export const metadata: Metadata = { title: "Client list" };

/**
 * Rows fetched per request. Sized well above any realistic ArcBase client roster
 * rather than paginated — the comp has no pager, and the table renders whatever
 * it is handed. If this ever caps, `truncated` below makes it visible.
 */
const PAGE_SIZE = 500;

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const { items, total } = await listClients({ q, pageSize: PAGE_SIZE });

  // Registering a Client is an Admin act (ADR 0013). A Data Analyst sees the full
  // roster — every row, every column — and simply has no way to add to it.
  //
  // ⚠️ HIDING THE DIALOG IS NOT THE BOUNDARY. `createClientAction` calls
  // `requireAdmin()` and the "arcbase add clients" RLS policy checks
  // `public.is_admin()`; those are what actually refuse. This only keeps the page
  // honest about what the viewer can do.
  const admin = isAdmin(await getRole());

  // The registry the Add-Client dialog offers, or `null` when it cannot be read.
  //
  // ⚠️ DEGRADES TO `null`, NEVER TO `[]`, AND NEVER THROWS. This is a working
  // screen. `supabase/arcbound-services.sql` has been applied since 2026-08-14,
  // so `listServices()` ordinarily succeeds — but it can still fail, and letting
  // that propagate would take the whole Client List down over a registry read,
  // while `[]` would claim Arcbound sells nothing. The dialog says it could not
  // load them and still registers the client (ADR 0015).
  //
  // The industries registry and the staff directory join it on the same terms
  // (D10) — both feed the Add-Client pickers, both degrade to `null`, and neither
  // may take the Client List down. ⚠️ `null` NEVER `[]`: the industries registry
  // is EMPTY today, so `[]` is a true and common answer and the dialog says
  // "an admin adds them under Settings, Industries". Collapsing a failed read
  // into that would send someone to add rows that already exist — and names are
  // unique case-insensitively, so they would collect constraint errors for it.
  //
  // Fetched together rather than in sequence: three independent reads, one
  // round-trip's worth of latency.
  const [services, industries, staff] = admin
    ? await Promise.all([
        listServices().catch(() => null),
        listIndustriesAdmin().catch(() => null),
        listStaffDirectory().catch(() => null),
      ])
    : [null, null, null];

  // The table shows every row it is given and has no pagination (neither does
  // the comp). If the fetch ever caps below the real total, the page SAYS SO —
  // a row that vanishes silently is the failure mode this codebase has been
  // bitten by before.
  const truncated = items.length < total;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
            <span className="text-primary">—</span>
            Clients
          </div>
          {/* ⚠️ "RECORDS ARE IMMUTABLE" WAS TRUE UNTIL S4 AND IS NOT ANY MORE.
              An admin can record and re-record a Client's industry and writer
              from the detail page, so the old caption promised something this
              product stopped keeping. What is still true is the half with
              teeth: `public.clients` has no update policy and the one function
              that writes it names two columns, so a Client's NAME — the key
              every scraped post is attributed on — and their LinkedIn URL
              cannot be edited here or anywhere. */}
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            {total} {total === 1 ? "client" : "clients"} · names and URLs locked
          </p>
        </div>
        {admin ? (
          <AddClientDialog services={services} industries={industries} staff={staff} />
        ) : null}
      </div>
      {truncated ? (
        <p
          role="status"
          className="rounded-md border border-primary/30 bg-primary/5 px-3.5 py-2.5 font-mono text-xs text-foreground"
        >
          Showing the first {items.length} of {total} clients. Narrow the filter to see the rest.
        </p>
      ) : null}
      <ClientsTable data={items} q={q ?? ""} />
    </div>
  );
}
