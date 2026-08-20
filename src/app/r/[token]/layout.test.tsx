import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ReportLinkLayout from "./layout";

// ─────────────────────────────────────────────────────────────────────────────
// THE CLIENT REPORT LINK IS DARK, ALWAYS.
//
// `/r/[token]` is the one surface a CLIENT opens — not staff. Staff keep a
// light default and a working Light/Dark toggle; this route ignores both.
//
// ⚠️ FORCED IN CSS, NOT THROUGH next-themes, AND print.css ALREADY PAID FOR THAT
// LESSON: "next-themes puts `dark` on <html>, which a nested layout cannot
// remove server-side". The same is true in reverse — a nested layout cannot ADD
// it server-side either, so a provider-based force would render light on the
// server and only flip after hydration. A Client would watch their report flash
// white. Re-declaring the tokens on a wrapper is server-rendered, needs no
// client JS, and cannot flash.
//
// ⚠️ AND IT WORKS FOR THE SAME REASON PRINT'S DOES: the report's components are
// entirely token-driven and use no `dark:` utility variants, so neutralising the
// tokens is the whole job. If a `dark:` variant ever appears in the report tree,
// the wrapper still covers it — `@custom-variant dark (&:is(.dark *))` matches
// descendants of `.dark` — but the token path is what carries it today.
// ─────────────────────────────────────────────────────────────────────────────

const LAYOUT_SRC = readFileSync(join(process.cwd(), "src/app/r/[token]/layout.tsx"), "utf8");
const GLOBALS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** The value a named custom property is given inside a given CSS block. */
function tokenIn(selector: string, prop: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(GLOBALS)?.[1];
  if (block === undefined) return null;
  return new RegExp(`${prop}\\s*:\\s*([^;]+);`).exec(block)?.[1]?.trim() ?? null;
}

function renderLayout() {
  render(<ReportLinkLayout>{<p>report body</p>}</ReportLinkLayout>);
  // The wrapper is the element the layout itself renders, i.e. the child's
  // nearest ancestor that carries the palette.
  return screen.getByText("report body").parentElement!;
}

describe("the client Report Link layout forces dark", () => {
  it("renders its children", () => {
    renderLayout();

    expect(screen.getByText("report body")).toBeInTheDocument();
  });

  it("⚠️ carries the `dark` class, which re-declares the dark tokens for the subtree", () => {
    // ⚠️ THE CLASS AS A WHOLE TOKEN, NOT A SUBSTRING. `toContain("dark")` would
    // be satisfied by a `dark:` variant utility that forces nothing at all —
    // the same defect shape as the `toContain("analytics")` lesson in
    // src/lib/author-match.test.ts.
    expect(renderLayout().classList.contains("dark")).toBe(true);
  });

  it("⚠️ paints its own ground, so the light page does not show through", () => {
    // Inside `.dark` these tokens resolve to the dark palette, so the wrapper
    // is the dark surface rather than a transparent pane over a warm-paper one.
    const wrapper = renderLayout();

    expect(wrapper.classList.contains("bg-background")).toBe(true);
    expect(wrapper.classList.contains("text-foreground")).toBe(true);
    // Full viewport height, or a short report leaves light below the fold.
    expect(wrapper.classList.contains("min-h-svh")).toBe(true);
  });

  it("⚠️ hooks the document ground too, for rubber-band overscroll", () => {
    // The wrapper covers the viewport but `<body>` keeps the `:root` (light)
    // background, which overscroll reveals as a pale strip on macOS and iOS. A
    // nested layout cannot put a class on <html> server-side (print.css records
    // why), so globals.css claims the ground from the wrapper's presence.
    expect(renderLayout().classList.contains("report-root")).toBe(true);
    expect(tokenIn(":root:has(.report-root)", "--background")).not.toBeNull();
  });

  it("⚠️ the document-ground override stays IN STEP with `.dark`", () => {
    // ⚠️ A DUPLICATED VALUE, PINNED RATHER THAN TRUSTED — the same problem
    // print-tokens.test.ts solves for `.print-root`. `:root:has()` cannot read a
    // custom property that only `.dark` declares, so the value is repeated; if
    // the palette ever moves, this fails instead of leaving one pale strip
    // behind on a client's screen.
    expect(tokenIn(":root:has(.report-root)", "--background")).toBe(
      tokenIn(".dark", "--background"),
    );
  });

  it("⚠️ ships NO client JavaScript to do it", () => {
    // The whole point of the CSS route. A `"use client"` layout or a nested
    // next-themes provider would move the decision to hydration time, which is
    // exactly the flash this avoids.
    //
    // ⚠️ THE IMPORT, NOT THE WORD. An earlier version of this assertion matched
    // `/next-themes/` anywhere in the file and was tripped by the layout's own
    // doc comment explaining why it does NOT use next-themes — a true sentence
    // failing a test about the opposite claim. Match the import statement.
    expect(LAYOUT_SRC).not.toMatch(/["']use client["']/);
    expect(LAYOUT_SRC).not.toMatch(/^\s*import[^;]*["']next-themes["']/m);
  });

  it("⚠️ does not touch the STAFF theme — no toggle, no provider, no default", () => {
    // Scope discipline: staff keep a light default and a working toggle. This
    // layout must not reach outside its own route to achieve a dark report.
    expect(LAYOUT_SRC).not.toMatch(/ThemeProvider|defaultTheme|forcedTheme|ModeToggle/);
  });
});
