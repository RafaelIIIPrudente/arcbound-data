/**
 * A minimal placeholder body for the ArcBase screens that later slices will
 * build out. Renders the design's mono section label plus a short note, inside
 * the shell (the page title itself is rendered by the top bar).
 */
export function Placeholder({ label, note }: { label: string; note: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
        <span className="text-primary">—</span>
        {label}
      </div>
      <p className="mt-3 max-w-prose text-sm text-muted-foreground">{note}</p>
    </div>
  );
}
