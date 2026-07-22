import type { ReportPeriod } from "@/services/types";

/**
 * The scope badge every chart card carries: WHICH period it covers, and HOW MANY
 * posts it is computed from.
 *
 * ⚠️ THE COUNT IS NOT DECORATION. These charts were pinned to all-time until
 * recently, so they always drew on a client's full history and N was implicitly
 * "everything". Scoped to a period they can rest on a handful of posts, where
 * "Image 40%" is two posts wearing the costume of a finding. Stating N is what
 * lets a reader tell a distribution over 5 posts from one over 500.
 *
 * One component so the four cards cannot drift into four different phrasings.
 */
export function ChartScope({ period, postCount }: { period: ReportPeriod; postCount: number }) {
  return (
    <div className="font-mono text-[10.5px] whitespace-nowrap text-muted-foreground">
      {period.kind === "all" ? "All time" : period.label}
      <span className="opacity-70"> · {postCount === 1 ? "1 post" : `${postCount} posts`}</span>
    </div>
  );
}
