import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Upload } from "@/services/types";

const HEAD = "font-mono text-[9.5px] tracking-[0.12em] uppercase";

/**
 * An upload's instant, as `Jul 16, 2026 · 09:12 UTC`.
 *
 * ⚠️ THE ZONE IS PART OF THE MEASUREMENT, NOT DECORATION. Both halves are forced
 * to UTC — which is right, and matches every other date this app renders — but an
 * unlabelled "09:12" is not a time, it is a riddle: a reviewer in India (UTC+5:30)
 * and an operator in Manila (UTC+8) each read it as their own wall clock, are each
 * wrong by a different amount, and have no way to find out. This is an audit
 * trail, so the exact instant is the point.
 *
 * ⚠️ THE UNPARSEABLE PASSTHROUGH BELOW GETS NO LABEL. A string this function
 * could not read is not an instant it may vouch for a zone about.
 */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  return `${date} · ${time} UTC`;
}

/**
 * `uploads === null` means the read FAILED. It renders as a stated problem, not
 * as "No uploads yet" — an empty table is a claim about the data, and making a
 * broken read look like a brand-new client is exactly the lie this screen was
 * telling before.
 */
export function UploadHistory({ uploads }: { uploads: Upload[] | null }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between gap-4 border-b px-5 py-4">
        <div className="flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
          <span className="text-primary">—</span>
          Upload history
        </div>
        {uploads && uploads.length > 1 ? (
          <span className="font-mono text-[11px] text-muted-foreground">Most recent first</span>
        ) : null}
      </div>

      {uploads === null ? (
        <p role="status" className="px-5 py-12 text-center text-sm text-muted-foreground">
          Upload history could not be loaded.
        </p>
      ) : uploads.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-muted-foreground">No uploads yet</p>
      ) : (
        // Natural column widths inside a scroller, rather than columns stretched
        // across the full width with dead space between every figure. 680px is
        // the comp's own min-width, and it fits the full column names.
        <div className="overflow-x-auto">
          <Table className="min-w-[680px]">
            <TableHeader>
              <TableRow>
                <TableHead scope="col" className={`${HEAD} w-10`}>
                  #
                </TableHead>
                <TableHead scope="col" className={HEAD}>
                  Uploaded
                </TableHead>
                <TableHead scope="col" className={HEAD}>
                  Source
                </TableHead>
                <TableHead scope="col" className={`${HEAD} text-right whitespace-nowrap`}>
                  Inserted
                </TableHead>
                <TableHead scope="col" className={`${HEAD} text-right whitespace-nowrap`}>
                  Updated
                </TableHead>
                <TableHead scope="col" className={`${HEAD} text-right whitespace-nowrap`}>
                  Unchanged
                </TableHead>
                <TableHead scope="col" className={`${HEAD} text-right`}>
                  Followers
                </TableHead>
                <TableHead scope="col" className={`${HEAD} pr-5 text-right`}>
                  Connections
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {uploads.map((upload, i) => (
                <TableRow key={upload.id}>
                  {/* Which ingest this was for the client — newest carries the
                      highest number, and the list is never truncated. */}
                  <TableCell className="font-mono text-xs text-muted-foreground/60 tabular-nums">
                    {uploads.length - i}
                  </TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {formatDate(upload.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="font-mono text-[9.5px] tracking-[0.08em] text-muted-foreground uppercase"
                    >
                      {upload.sourceType.toUpperCase()}
                    </Badge>
                  </TableCell>
                  {/* Tonal hierarchy, not decoration: inserted rows are the
                      signal (new posts landed), unchanged is the noise floor. */}
                  <TableCell className="text-right font-mono text-[13px] text-primary tabular-nums">
                    {upload.rowsInserted.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[13px] tabular-nums">
                    {upload.rowsUpdated.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[13px] text-muted-foreground/60 tabular-nums">
                    {upload.rowsUnchanged.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[13px] text-muted-foreground tabular-nums">
                    {upload.followerCount != null ? upload.followerCount.toLocaleString() : "—"}
                  </TableCell>
                  {/* ⚠️ `!= null`, SO A RECORDED 0 STILL PRINTS AS 0. The dash is
                      reserved for "this scrape carried no connection count" —
                      which is every upload made before the field existed, and any
                      upload where staff left it blank. A `0` there would report a
                      measurement nobody took. */}
                  <TableCell className="pr-5 text-right font-mono text-[13px] text-muted-foreground tabular-nums">
                    {upload.connectionsCount != null
                      ? upload.connectionsCount.toLocaleString()
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
