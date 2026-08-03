import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AnalyticsUnavailable } from "@/components/dashboard/analytics/analytics-unavailable";
import {
  NotAssignedGate,
  ServicesUnreadableNotice,
} from "@/components/dashboard/client/service-gate";
import { PrintReport } from "@/components/dashboard/report/print/print-report";
import { ReportCover } from "@/components/dashboard/report/print/report-cover";
import { canSee } from "@/lib/service-access";
import { getClientServices } from "@/services/arcbound-services";
import { getClientReport } from "@/services/client-report";
import { getClient } from "@/services/clients";

export const metadata: Metadata = { title: "Client LinkedIn report — print" };

/**
 * The printable export of `/clients/[id]/report`.
 *
 * A SECOND PRESENTATION of the same data, never a second calculation of it:
 * every figure comes from `getClientReport`, the same seam the screen reads, so
 * the document and the app cannot disagree by a post.
 *
 * Staff produce this and send it on — no client ever logs in (ADR 0007) — so
 * there is no share link, just the browser's print dialog.
 */
export default async function ClientReportPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const [{ id }, { period }] = await Promise.all([params, searchParams]);

  // Independent reads — see the on-screen report page for the reasoning. The
  // report for a non-existent client is discarded by the notFound() below.
  const [client, report, access] = await Promise.all([
    getClient(id),
    getClientReport({ clientId: id, period }),
    getClientServices(id),
  ]);
  if (!client) notFound();

  // ⚠️ THE SAME GATE AS THE ON-SCREEN REPORT, BECAUSE THIS IS WHERE A REPORT
  // LEAVES THE BUILDING. The on-screen page is seen by staff only; this document
  // is what staff hand or send to a Client. An ungated print export would let a
  // report be produced — and exported — for an engagement that does not exist,
  // reachable by a staff member pasting this URL directly regardless of what the
  // on-screen page shows. `canSee` fails OPEN on a null (unreadable) read, so an
  // unreadable registry still renders the real report, with the same warning
  // banner the on-screen page carries.
  const assigned = canSee(access?.held ?? null, "linkedin_post_metrics");

  if (!assigned) {
    return (
      <NotAssignedGate
        clientId={client.id}
        clientName={client.name}
        sectionName="LinkedIn Report"
      />
    );
  }

  if (report.unavailable) {
    return <AnalyticsUnavailable />;
  }

  return (
    <>
      {access === null ? <ServicesUnreadableNotice /> : null}
      <ReportCover
        clientName={client.name}
        linkedinUrl={client.linkedin_url}
        period={report.period}
        // Straight from the seam — the cover does no arithmetic of its own.
        figures={report.keyPerformance.selected}
        // The cover figures rest on the same read as the panels, so it carries
        // the same truncation caveat when that read was partial (PrintReport
        // renders it again above the body).
        truncation={report.truncation}
        // Passed in rather than read inside the component, so the rendered
        // document is a pure function of its inputs and stays testable.
        now={new Date()}
      />
      <PrintReport report={report} />
    </>
  );
}
