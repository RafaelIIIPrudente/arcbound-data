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
 * Likes / Comments / Shares by Selected Period / Prior 3 Months / All Time.
 *
 * The underlying BI field is `reposts`; staff always see "Shares", which is what
 * LinkedIn itself calls the action.
 */
export function InteractionsComparison({ rows }: { rows: InteractionsRow[] }) {
  const isEmpty = rows.every((r) => r.likes === 0 && r.comments === 0 && r.shares === 0);

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
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
