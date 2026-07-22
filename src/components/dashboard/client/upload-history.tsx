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

const HEAD = "font-mono text-[10px] tracking-[0.12em] uppercase";

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
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
          <span className="text-primary">—</span>
          Upload history
        </div>
      </div>

      {uploads === null ? (
        <p role="status" className="px-5 py-12 text-center text-sm text-muted-foreground">
          Upload history could not be loaded.
        </p>
      ) : uploads.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-muted-foreground">No uploads yet</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col" className={HEAD}>
                Date
              </TableHead>
              <TableHead scope="col" className={HEAD}>
                Source
              </TableHead>
              <TableHead scope="col" className={`${HEAD} text-right`}>
                Inserted
              </TableHead>
              <TableHead scope="col" className={`${HEAD} text-right`}>
                Updated
              </TableHead>
              <TableHead scope="col" className={`${HEAD} text-right`}>
                Unchanged
              </TableHead>
              <TableHead scope="col" className={`${HEAD} text-right`}>
                Followers
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {uploads.map((upload) => (
              <TableRow key={upload.id}>
                <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
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
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {upload.rowsInserted.toLocaleString()}
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {upload.rowsUpdated.toLocaleString()}
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-muted-foreground tabular-nums">
                  {upload.rowsUnchanged.toLocaleString()}
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-muted-foreground tabular-nums">
                  {upload.followerCount != null ? upload.followerCount.toLocaleString() : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
