import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AnalyticsUnavailable } from "@/components/dashboard/analytics/analytics-unavailable";
import { PrintReport } from "@/components/dashboard/report/print/print-report";
import { ReportCover } from "@/components/dashboard/report/print/report-cover";
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

  const client = await getClient(id);
  if (!client) notFound();

  const report = await getClientReport({ clientId: id, period });

  if (report.unavailable) {
    return <AnalyticsUnavailable />;
  }

  return (
    <>
      <ReportCover
        clientName={client.name}
        linkedinUrl={client.linkedin_url}
        period={report.period}
        // Straight from the seam — the cover does no arithmetic of its own.
        figures={report.keyPerformance.selected}
        // Passed in rather than read inside the component, so the rendered
        // document is a pure function of its inputs and stays testable.
        now={new Date()}
      />
      <PrintReport report={report} />
    </>
  );
}
