import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { InteractionsRow } from "@/services/types";

/**
 * Drop the scoped row when it is the all-time row wearing the same hat.
 *
 * Selecting "All time" makes the scoped window and the all-time window the same
 * posts under the same heading, so the table would print one figure twice. On
 * screen that reads as redundant; on a document sent to a client it reads as
 * broken, so the pair is collapsed to the single all-time row.
 *
 * Matching on the LABEL as well as the numbers is deliberate: a scoped period
 * can legitimately contain every post on record (a client whose whole history
 * is one month), and "July 2026" beside "All time" is then two real facts that
 * happen to coincide — not a duplicate.
 */
export function visibleInteractionRows(rows: InteractionsRow[]): InteractionsRow[] {
  const selected = rows.find((r) => r.scope === "selected");
  const allTime = rows.find((r) => r.scope === "allTime");

  const isDuplicate =
    selected !== undefined &&
    allTime !== undefined &&
    selected.label === allTime.label &&
    selected.likes === allTime.likes &&
    selected.comments === allTime.comments &&
    selected.shares === allTime.shares &&
    // Saves joins the comparison so the collapse stays CONSERVATIVE: two rows
    // that differ only in saves are two facts, not one repeated, and must not be
    // silently merged into whichever happened to be kept.
    selected.saves === allTime.saves;

  return isDuplicate ? rows.filter((r) => r.scope !== "selected") : rows;
}

/**
 * The Saves cell — three states, deliberately distinguishable.
 *
 * ⚠️ `saves` IS GENUINELY NULLABLE: the scrape may omit it. Summing absent values
 * as zero would report a missing measurement as a measured one, and a partial
 * sum printed as a total is the same lie in a subtler form. So:
 *   • null    → em dash, with the reason spoken
 *   • partial → the sum, marked as a LOWER BOUND
 *   • whole   → a plain sum
 */
function SavesCell({ row }: { row: InteractionsRow }) {
  if (row.saves === null) {
    return (
      <>
        <span aria-hidden>—</span>
        <span className="sr-only">Saves were not reported for any post in this period</span>
      </>
    );
  }
  if (row.savesPartial) {
    return (
      <>
        <span aria-hidden>≥ </span>
        <span className="sr-only">At least </span>
        {row.saves.toLocaleString()}
        <span className="sr-only"> — some posts in this period did not report saves</span>
      </>
    );
  }
  return <>{row.saves.toLocaleString()}</>;
}

/**
 * Likes / Comments / Shares / Saves by Selected Period / Prior 3 Months / All Time.
 *
 * The underlying BI field is `reposts`; staff always see "Shares", which is what
 * LinkedIn itself calls the action.
 *
 * ⚠️ SHARED WITH THE PRINT REPORT (print/print-report.tsx), which renders it into
 * a 700px paper column (`--print-column` in print.css). Five columns fit — cells
 * are `p-2` and every metric cell is short — but any FURTHER column needs the
 * printed sheet checked by eye before it ships, not just the test suite.
 */
export function InteractionsComparison({ rows }: { rows: InteractionsRow[] }) {
  const visible = visibleInteractionRows(rows);
  const isEmpty = visible.every((r) => r.likes === 0 && r.comments === 0 && r.shares === 0);

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-4 font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
        Interactions comparison
      </div>

      {isEmpty ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No posts in this period.</p>
      ) : (
        // Narrow phones scroll the table itself, never the page body.
        <div className="w-full overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-mono text-[10px] tracking-[0.12em] uppercase">
                  Period
                </TableHead>
                <TableHead className="text-right font-mono text-[10px] tracking-[0.12em] uppercase">
                  Likes
                </TableHead>
                <TableHead className="text-right font-mono text-[10px] tracking-[0.12em] uppercase">
                  Comments
                </TableHead>
                <TableHead className="text-right font-mono text-[10px] tracking-[0.12em] uppercase">
                  Shares
                </TableHead>
                <TableHead className="text-right font-mono text-[10px] tracking-[0.12em] uppercase">
                  Saves
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => (
                <TableRow key={row.scope}>
                  <TableCell className="font-medium whitespace-nowrap">{row.label}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.likes.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.comments.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.shares.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <SavesCell row={row} />
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
