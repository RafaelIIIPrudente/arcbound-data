import type { Metadata } from "next";

import { DataQualitySummary } from "@/components/dashboard/data-quality/data-quality-summary";
import { DataQualityTable } from "@/components/dashboard/data-quality/data-quality-table";
import { getDataQuality } from "@/services/data-quality";

export const metadata: Metadata = { title: "Data quality" };

/**
 * ⚠️ EXPLICITLY DYNAMIC, AND IT HAS TO BE SAID OUT LOUD HERE.
 *
 * This route has no params, so Next tries to prerender it at build time. Every
 * read it makes is cookie-bound, and each one CATCHES its own errors and
 * degrades — including the `DynamicServerError` Next throws to signal "you
 * touched cookies". Next still infers the route is dynamic, but the swallowed
 * signal surfaced as three alarming "read failed" warnings in every build.
 *
 * Declaring it removes the guesswork: no prerender attempt, no misleading
 * build output, and the degradation stays intact for real request-time failures.
 */
export const dynamic = "force-dynamic";

export default async function DataQualityPage() {
  const data = await getDataQuality();

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
          <span className="text-primary">—</span>
          Pipeline health
        </div>
        <h2 className="mt-2.5 font-display text-3xl leading-none font-extrabold tracking-tight">
          Data quality
        </h2>
      </div>

      <DataQualitySummary data={data} />

      <section className="space-y-4">
        <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
          <span className="text-primary">—</span>
          By client
        </div>
        <DataQualityTable rows={data.rows} />
      </section>
    </div>
  );
}
