import * as React from "react";

/**
 * Whether a CSS media query currently matches.
 *
 * The general form of `useIsMobile`, which answers one hard-coded breakpoint.
 * Use this when the breakpoint belongs to the component rather than to the app
 * shell — the date-range picker asks for Tailwind's `sm` so it can drop from two
 * calendar months to one.
 *
 * ⚠️ RETURNS FALSE UNTIL THE EFFECT HAS RUN, DELIBERATELY. There is no viewport
 * on the server, so the first client render has to agree with the markup the
 * server produced or React reports a hydration mismatch. Reading `matchMedia`
 * during render would be "correct" and would break exactly that. The consequence
 * is that the NARROW layout must be the safe default at every call site — a
 * component that renders the wide layout on `false` would flash the wrong one.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(false);

  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
