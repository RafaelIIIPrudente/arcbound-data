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
  return `${date} · ${time}`;
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
                <TableHead scope="col" className={`${HEAD} pr-5 text-right`}>
                  Followers
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
                  <TableCell className="pr-5 text-right font-mono text-[13px] text-muted-foreground tabular-nums">
                    {upload.followerCount != null ? upload.followerCount.toLocaleString() : "—"}
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
