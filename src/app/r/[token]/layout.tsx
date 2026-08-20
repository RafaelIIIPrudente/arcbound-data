/**
 * The client Report Link shell: dark, always, whatever the viewer's theme is.
 *
 * ⚠️ THIS IS THE ONE SURFACE A CLIENT SEES, AND IT DOES NOT INHERIT STAFF TASTE.
 * Everything else under `src/app` is internal: staff keep the warm-paper light
 * default and a working Light/Dark toggle in the top bar. `/r/[token]` ignores
 * both — the report a Client opens looks the same for every Client, every time,
 * and does not change because a staff member once clicked "Light" in a browser
 * that later opened the link.
 *
 * ⚠️ FORCED IN CSS, NOT THROUGH next-themes, AND print.css ALREADY PAID FOR THIS
 * LESSON: "next-themes puts `dark` on <html>, which a nested layout cannot
 * remove server-side". The reverse is equally true — a nested layout cannot ADD
 * it server-side either. A provider-based force would render light on the server
 * and only flip after hydration, so a Client would watch their own report flash
 * white. Re-declaring the tokens on this wrapper is server-rendered, needs no
 * client JS, and cannot flash.
 *
 * ⚠️ AND IT WORKS FOR THE SAME REASON `.print-root` DOES: the report's
 * components are entirely token-driven, so neutralising the tokens is the whole
 * job. `.dark` re-declares every one of them, and because
 * `@custom-variant dark (&:is(.dark *))` matches descendants of `.dark`, any
 * `dark:` variant that later appears in this tree is covered too.
 *
 * ⚠️ `report-root` IS A HOOK, NOT A STYLE. The wrapper covers the viewport, but
 * `<body>` keeps the `:root` background, which rubber-band overscroll reveals as
 * a pale strip. globals.css uses this class to claim the document ground — see
 * the block there, and `layout.test.tsx`, which pins the two palettes in step.
 */
export default function ReportLinkLayout({ children }: { children: React.ReactNode }) {
  return <div className="dark report-root min-h-svh bg-background text-foreground">{children}</div>;
}
