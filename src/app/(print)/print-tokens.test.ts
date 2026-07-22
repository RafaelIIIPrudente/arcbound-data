import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CHART_WIDTH } from "@/components/dashboard/report/print/print-report";

// ─────────────────────────────────────────────────────────────────────────────
// The exported report must print in the LIGHT palette whatever theme the staff
// member is using, and a nested layout cannot strip `dark` off <html>. print.css
// therefore re-declares the light tokens on `.print-root`.
//
// That copy is the risk: retune the light palette in globals.css and the PDF
// silently keeps the old colours — working software, wrong output, and nobody
// finds out until a client has it. This is that guard. It asserts the invariant
// that actually matters: every token `.dark` overrides is neutralised by
// `.print-root`, at exactly the `:root` value.
// ─────────────────────────────────────────────────────────────────────────────

const GLOBALS = join(process.cwd(), "src/app/globals.css");
const PRINT = join(process.cwd(), "src/app/(print)/print.css");

/** The custom-property declarations inside the first `<selector> { … }` block. */
function customProps(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No \`${selector}\` block found`);
  const body = css.slice(start, css.indexOf("}", start));

  const props = new Map<string, string>();
  for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    props.set(name!, value!.trim());
  }
  return props;
}

describe("the print palette stays in step with globals.css", () => {
  const globals = readFileSync(GLOBALS, "utf8");
  const print = readFileSync(PRINT, "utf8");

  const light = customProps(globals, ":root");
  const dark = customProps(globals, ".dark");
  const printed = customProps(print, ".print-root");

  it("reads a real palette from each file", () => {
    // Guard the guard: a failed parse would make every assertion below vacuous.
    expect(light.size).toBeGreaterThan(20);
    expect(dark.size).toBeGreaterThan(20);
    expect(printed.size).toBeGreaterThan(20);
  });

  it("reserves a preview column exactly as wide as the charts are drawn", () => {
    // The charts take a fixed pixel width because they cannot be measured in a
    // print context. If the column and that width drift apart, a chart that
    // fits on paper overflows the preview — or vice versa, which is worse,
    // because it is only visible once someone has the PDF.
    expect(printed.get("--print-column")).toBe(`${CHART_WIDTH}px`);
  });

  /**
   * The three surfaces the printed document deliberately keeps WHITE while the
   * app is on warm paper. Everything else must stay in step with globals.css.
   */
  const PRINT_WHITE = new Set(["--background", "--card", "--popover"]);

  it.each([...dark.keys()].filter((t) => !PRINT_WHITE.has(t)))(
    "neutralises %s at the light value",
    (token) => {
      // If this fails for a NEW token, add it to `.print-root` in print.css —
      // otherwise that one value leaks through dark and prints nearly black.
      expect(printed.get(token)).toBe(light.get(token));
    },
  );

  it.each([...PRINT_WHITE])(
    "keeps %s WHITE on paper, diverging from the app on purpose",
    (token) => {
      // ⚠️ INTENTIONAL DIVERGENCE, NOT DRIFT.
      //
      // globals.css moved the app to #F4F3F0. The sheet does not follow: paper is
      // already the ground, and flooding a page edge-to-edge with a tint burns
      // toner, bands on cheap printers, and renders only when the reader has
      // "Background graphics" enabled — the same PDF would look different for
      // different people. White sheet, dark ink, warm hairlines.
      expect(printed.get(token)).toBe("oklch(1 0 0)");
      expect(printed.get(token)).not.toBe(dark.get(token));
    },
  );

  it("proves the divergence is real, so the rule above is not vacuous", () => {
    expect(light.get("--background")).toBe("#f4f3f0");
    expect(printed.get("--background")).not.toBe(light.get("--background"));
  });
});
