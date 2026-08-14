// ─────────────────────────────────────────────────────────────────────────────
// THE DASHBOARD'S RANGE VOCABULARY: the options the filter bar offers, the
// lengths the URL decoder accepts, and the default. ONE list, read from BOTH
// sides of the RSC boundary.
//
// ⚠️ THIS MODULE MUST NOT CARRY "use client".
//
// It is imported by `dashboard-filters.tsx` (a Client Component, which renders
// the buttons) AND by `src/app/(app)/page.tsx` (an RSC, which hands
// `PRESET_DAYS` to `decodeRange` as the whitelist). A "use client" directive
// turns EVERY EXPORT of a module into a client reference — not just the
// components — so a server module importing a constant from one does not get
// the constant. It gets a proxy, and the first property access throws.
//
// ⚠️ THE COMMENT THIS REPLACES CLAIMED THE OPPOSITE, AND IT SHIPPED A CRASH.
// `dashboard-filters.tsx` used to say "PLAIN DATA, DELIBERATELY — no function is
// exported from this 'use client' module … Constants are not references." That
// is FALSE. The directive converts EXPORTS, not values; a `const` array is
// converted exactly like a function. `page.tsx` imported `PRESET_DAYS` on the
// strength of that comment, and `decodeRange`'s `presets.includes(days)` threw
// on `/?range=7d` and `/?range=90d` in production.
//
// ⚠️ 30d WAS NEVER SPECIAL — IT MERELY NEVER TRAVELLED. `DEFAULT_RANGE` used to
// be stripped from the URL, so the one preset that appeared to work was the one
// that never reached the decoder. `?range=all` returned before the whitelist was
// read. Between them, the two URLs anybody actually opened worked, and the crash
// reached an external reviewer instead of the first person to click a preset.
//
// Nothing catches this shape by accident: `next build` never executes a dynamic
// route, and under Vitest the directive is inert. `src/rsc-boundary.test.ts`
// pins the rule for the whole of `src/`; `dashboard-range.test.ts` pins this
// module's own directive-freedom. `report-period.ts` is the same pattern for the
// report's `?period=` dialect.
// ─────────────────────────────────────────────────────────────────────────────

/** The range options the dashboard's picker offers, in the order it shows them. */
export const DASHBOARD_PRESETS: { key: string; label: string }[] = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "all", label: "All time" },
];

/**
 * The preset LENGTHS the decoder will accept. All-time is not a length.
 *
 * Read by `page.tsx` so the whitelist and the buttons above cannot drift: a key
 * the picker offers and the decoder rejects would silently snap back to the
 * default, with nothing on screen saying so.
 */
export const PRESET_DAYS = [7, 30, 90];

/**
 * The window a bare `/` means.
 *
 * ⚠️ IT IS WRITTEN TO THE URL LIKE ANY OTHER TOKEN — `hrefFor` no longer strips
 * it. `report-period.ts` records the same lesson for `?period=`: stripping a
 * param at its default makes a deliberate choice indistinguishable from no
 * choice. Here it also hid a crash, by keeping the one preset that would have
 * exercised `decodeRange` out of the URL entirely. An ABSENT `range` is still
 * accepted and still resolves here, so `/` remains a valid address.
 */
export const DEFAULT_RANGE = "30d";
