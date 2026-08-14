import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { decodeRange } from "@/lib/date-range";

import { DASHBOARD_PRESETS, DEFAULT_RANGE, PRESET_DAYS } from "./dashboard-range";

const MODULE = "src/components/dashboard/analytics/dashboard-range.ts";
const CLIENT_MODULE = "src/components/dashboard/analytics/dashboard-filters.tsx";

function sourceOf(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("the server/client boundary this module straddles", () => {
  it('keeps dashboard-range.ts free of "use client"', () => {
    // THIS IS NOT COSMETIC. `PRESET_DAYS` is READ by `src/app/(app)/page.tsx`,
    // an RSC, and handed to `decodeRange` as its whitelist. A "use client"
    // directive turns EVERY export in a module into a client reference — the
    // constants included — and `presets.includes(days)` on a client reference
    // throws at request time.
    //
    // Nothing else catches it: `/` is dynamic, so `next build` never executes
    // it, and in vitest the directive is inert, so every other test here passes
    // either way. This assertion is the only thing standing between that
    // mistake and a production error on `/?range=7d`.
    expect(sourceOf(MODULE)).not.toMatch(/^\s*["']use client["']/m);
  });

  it("reads the module it is guarding", () => {
    // Guard the guard: a wrong path would make the assertion above vacuous.
    expect(sourceOf(MODULE)).toContain("export const PRESET_DAYS");
  });

  it("proves the guard can see a directive at all", () => {
    // And guard it in the other direction: an assertion that never fires proves
    // nothing. The filter bar IS a client module, and the same regex finds it.
    expect(sourceOf(CLIENT_MODULE)).toMatch(/^\s*["']use client["']/m);
  });

  it("does not let the client module re-export these constants", () => {
    // ⚠️ RE-EXPORTING FROM `dashboard-filters.tsx` WOULD REBUILD THE TRAP. A
    // re-export out of a "use client" module is itself a client reference, so
    // the next importer — reaching for the name where it used to live — would
    // get a proxy again, and this time with a module that looks fixed.
    const client = sourceOf(CLIENT_MODULE);

    for (const name of ["DASHBOARD_PRESETS", "PRESET_DAYS", "DEFAULT_RANGE"]) {
      expect(client, name).not.toMatch(new RegExp(`export\\s+(?:const\\s+)?${name}\\b`));
      expect(client, name).not.toMatch(new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`));
    }
  });
});

describe("the vocabulary itself", () => {
  it("offers exactly the preset lengths the decoder accepts, plus all-time", () => {
    // The two lists are separate exports and could drift; this is what stops a
    // key the picker offers from being one the decoder silently refuses.
    expect(DASHBOARD_PRESETS.map((p) => p.key)).toEqual([
      ...PRESET_DAYS.map((d) => `${d}d`),
      "all",
    ]);
  });

  it("has every offered key survive the REAL decoder", () => {
    // Driven through `decodeRange` itself, not a restatement of it: a preset
    // the decoder rejects would snap back to the default with nothing on screen
    // saying so.
    for (const { key } of DASHBOARD_PRESETS) {
      expect(decodeRange(key, PRESET_DAYS), key).not.toBeNull();
    }
  });

  it("has a default that is one of the offered keys", () => {
    expect(DASHBOARD_PRESETS.map((p) => p.key)).toContain(DEFAULT_RANGE);
    expect(decodeRange(DEFAULT_RANGE, PRESET_DAYS)).toEqual({ kind: "preset", days: 30 });
  });
});
