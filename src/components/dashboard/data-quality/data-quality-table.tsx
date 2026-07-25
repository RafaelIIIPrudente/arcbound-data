import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { paths } from "@/paths";
import type { DataQualityRow } from "@/services/types";

const HEAD = "font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase";
const NUM = "font-mono text-sm tabular-nums";

/**
 * A figure that could not be read.
 *
 * ⚠️ NEVER FOR A ZERO. A `0` is a measured fact ("nothing was submitted"); this
 * is the absence of one. The spoken text carries the difference, because the
 * glyph alone is indistinguishable from an empty cell.
 */
function Unknown({ what }: { what: string }) {
  return (
    <>
      <span aria-hidden>—</span>
      <span className="sr-only">{what} could not be read</span>
    </>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * True when posts went to staging and none came back attributed.
 *
 * ⚠️ NOT A DIAGNOSIS. This says the two numbers disagree, nothing more — the
 * cause lives downstream of ArcBase and is not knowable from here.
 */
function nothingCameBack(row: DataQualityRow): boolean {
  return row.submitted !== null && row.submitted > 0 && row.attributed === 0;
}

export function DataQualityTable({ rows }: { rows: DataQualityRow[] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className={HEAD}>
              Client
            </TableHead>
            <TableHead scope="col" className={`${HEAD} text-right`}>
              Submitted
            </TableHead>
            <TableHead scope="col" className={`${HEAD} text-right`}>
              Attributed
            </TableHead>
            <TableHead scope="col" className={`${HEAD} text-right`}>
              Undated
            </TableHead>
            <TableHead scope="col" className={`${HEAD} text-right`}>
              Unknown type
            </TableHead>
            <TableHead scope="col" className={HEAD}>
              Last ingest
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center">
                No clients registered yet.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => {
              const flagged = nothingCameBack(row);
              return (
                <TableRow key={row.clientId}>
                  <TableCell className="max-w-0">
                    <Link
                      href={paths.clients.details(row.clientId)}
                      className="block truncate font-display text-[15px] font-semibold underline-offset-4 hover:underline"
                    >
                      {row.clientName}
                    </Link>
                  </TableCell>
                  <TableCell className={`${NUM} text-right`}>
                    {row.submitted === null ? (
                      <Unknown what="Submitted posts" />
                    ) : (
                      row.submitted.toLocaleString()
                    )}
                  </TableCell>
                  <TableCell className={`${NUM} text-right`}>
                    {/* Emphasis is weight + a marker + spoken text — NEVER colour
                        alone, which would carry the whole signal visually. */}
                    <span className={flagged ? "font-bold text-primary" : undefined}>
                      {flagged ? <span aria-hidden>▲ </span> : null}
                      {row.attributed.toLocaleString()}
                      {flagged ? (
                        <span className="sr-only">
                          {" "}
                          — no posts have been attributed back to this client
                        </span>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className={`${NUM} text-right`}>
                    {row.undated.toLocaleString()}
                  </TableCell>
                  <TableCell className={`${NUM} text-right`}>
                    {row.unknownFormat.toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.lastIngest === "unavailable" ? (
                      <Unknown what="Last ingest" />
                    ) : row.lastIngest === null ? (
                      // A KNOWN fact, not missing data.
                      <span className="text-muted-foreground/60">Never</span>
                    ) : (
                      formatDate(row.lastIngest)
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
