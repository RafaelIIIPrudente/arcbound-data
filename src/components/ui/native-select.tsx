import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A native `<select>`, styled to sit beside `Input` in the same form.
 *
 * ⚠️ NATIVE, NOT THE RADIX `Select` IN `ui/select.tsx`, AND THAT IS A DECISION.
 * Radix rejects `<SelectItem value="">`, so "not recorded" — a real, legitimate
 * answer for a nullable column — would need a sentinel string mapped back to
 * NULL somewhere between the click and the database. That is one more place a
 * cleared field could hide, on the two forms in this app where a silently
 * cleared field is the whole hazard. A native empty option posts `""`, which the
 * action turns into `null` with nothing in between. It is also uncontrolled, so
 * the browser posts exactly what is on screen.
 *
 * ⚠️ THIS EXISTS SO FEATURE COMPONENTS STOP RE-DECLARING `Input`'S CLASS LIST.
 * Two of them had copied the same trimmed-down 130-character literal verbatim;
 * a change to the input primitive reached neither. If this drifts from
 * `ui/input.tsx`, the two controls stop matching — which is visible, unlike two
 * private copies drifting from each other.
 */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };
