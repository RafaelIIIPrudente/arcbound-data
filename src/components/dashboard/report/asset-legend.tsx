import type { AssetBucket } from "@/services/types";

import { rampColor } from "./ramp";

/**
 * The ranked asset-type figures as TEXT, beneath the chart.
 *
 * An SVG chart is invisible to a screen reader, and recharts' axis labels only
 * exist once a real layout engine has measured the container — so this legend is
 * both the accessible reading of the panel and the only place the asset labels
 * are guaranteed to reach the DOM.
 *
 * Labels come from `bucket.label` (FORMAT_LABELS). A raw scraper token such as
 * SLIDE_SHOW must never appear here.
 */
export function AssetLegend({
  data,
  format,
}: {
  data: AssetBucket[];
  format: (value: number) => string;
}) {
  return (
    <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t pt-3">
      {data.map((bucket, i) => (
        <li key={bucket.format} className="flex items-center gap-1.5 font-mono text-[10.5px]">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-[2px]"
            style={{ backgroundColor: rampColor(i, data.length) }}
          />
          <span className="text-muted-foreground">{bucket.label}</span>
          <span className="tabular-nums">{format(bucket.value)}</span>
        </li>
      ))}
    </ul>
  );
}
