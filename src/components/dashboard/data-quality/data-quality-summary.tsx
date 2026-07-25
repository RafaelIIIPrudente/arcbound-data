import type { DataQuality } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// The page-level summary: the unattributed-posts figure, plus an honest account
// of which sources answered.
//
// ⚠️ NO VERDICTS. ArcBase can see that posts were submitted and did not come
// back; it cannot see why. A name mismatch, a client who genuinely stopped
// posting, and a downstream outage are indistinguishable from here — so nothing
// on this screen says "broken", "failed", or "wrong".
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A figure that could not be read. NEVER used for a zero — a `0` here is a
 * measured fact, and the em dash is the absence of one.
 */
function Unknown({ what }: { what: string }) {
  return (
    <>
      <span aria-hidden>—</span>
      <span className="sr-only">{what} could not be read</span>
    </>
  );
}

/** One plain-language notice about a source that is missing or incomplete. */
function SourceNotice({ children }: { children: React.ReactNode }) {
  return (
    <li className="font-mono text-xs leading-relaxed text-muted-foreground">
      <span aria-hidden className="mr-1.5 text-primary">
        —
      </span>
      {children}
    </li>
  );
}

export function DataQualitySummary({ data }: { data: DataQuality }) {
  const { sources, unattributedPosts, rows } = data;

  const notices: React.ReactNode[] = [];
  if (sources.clientsUnavailable) {
    notices.push("The client list couldn’t be read, so no clients are shown below.");
  }
  if (sources.postsUnavailable) {
    notices.push(
      "Post data couldn’t be read, so attributed, undated and asset-type counts are unknown.",
    );
  }
  // ⚠️ TRUNCATED IS ITS OWN STATE, not a flavour of unavailable. The rows are
  // real; there are simply more of them than were read, so every post figure on
  // this page is a floor rather than a total. Saying so is the whole point.
  if (sources.postsTruncated) {
    notices.push(
      "More posts exist than could be read in one pass, so every post figure below is a minimum, not a total.",
    );
  }
  if (sources.uploadsUnavailable) {
    notices.push(
      "Upload history couldn’t be read, so submitted counts and last ingest are unknown.",
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-stretch gap-3.5">
        <div className="min-w-52 rounded-lg border bg-card px-5 py-4">
          <div className="font-display text-3xl leading-none font-extrabold tracking-tight tabular-nums">
            {unattributedPosts === null ? (
              <Unknown what="The unattributed post count" />
            ) : (
              unattributedPosts.toLocaleString()
            )}
          </div>
          <div className="mt-2 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            Posts not matched to a client
          </div>
        </div>

        <div className="min-w-40 rounded-lg border bg-card px-5 py-4">
          <div className="font-display text-3xl leading-none font-extrabold tracking-tight tabular-nums">
            {rows.length.toLocaleString()}
          </div>
          <div className="mt-2 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            Clients tracked
          </div>
        </div>
      </div>

      <p className="max-w-2xl text-sm text-muted-foreground">
        Posts are matched to clients after they leave ArcBase, by name. ArcBase can show what it
        submitted and what came back — it can’t see why a post didn’t return.
      </p>

      {notices.length > 0 ? (
        <ul className="space-y-1.5 rounded-lg border border-dashed bg-muted/30 px-5 py-4">
          {notices.map((notice, i) => (
            <SourceNotice key={i}>{notice}</SourceNotice>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
