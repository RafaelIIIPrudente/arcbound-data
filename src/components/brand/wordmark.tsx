import { cn } from "@/lib/utils";

/**
 * The ArcBase wordmark: "Arc" in the foreground colour and "Base" in the red
 * accent, set in Inter Tight (the display font). Size is controlled by the
 * caller via `className` (e.g. `text-xl`).
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display leading-none font-extrabold tracking-tight", className)}>
      Arc<span className="text-primary">Base</span>
    </span>
  );
}
