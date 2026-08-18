import { readFileSync } from "node:fs";
import { join, relative, resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// D3, ASSERTED RATHER THAN INTENDED: A CLIENT'S REPORT NEVER LEARNS WHO WORKS
// ON THEM.
//
// Industry and Writer are STAFF fields. A Writer is an Arcbound staff member and
// the surfaces that show one render their email address, so nothing about either
// field may reach `/r/[token]` — the tokenised, read-only page a Client opens.
// The decision record puts it as "the `/r/[token]` bundle must not grow. Assert
// the latter", and until now nothing did: three client components and a route
// were added across S3–S5 with no check that none of them travelled.
//
// ⚠️ REACHABILITY, NOT A BYTE COUNT, AND THAT IS THE STRONGER CLAIM. A kilobyte
// budget goes stale the first time an unrelated dependency moves, and it cannot
// say WHY it grew. This walks the route's real import graph, works out which
// half of it crosses into the browser, and names the modules that may not be in
// that half — so the failure message is "a Client's browser must not receive the
// staff directory", which is the actual defect.
//
// ⚠️ TYPE-ONLY IMPORTS ARE SKIPPED, deliberately. They are erased before the
// code runs, so they add nothing to any bundle and carry no data to anyone.
// ─────────────────────────────────────────────────────────────────────────────

const SRC = join(process.cwd(), "src");
const ROUTE = join(SRC, "app", "r", "[token]");

/** The route's own entry points, plus the layout every page renders inside. */
const ENTRIES = [
  join(ROUTE, "page.tsx"),
  join(ROUTE, "gate.tsx"),
  join(ROUTE, "actions.ts"),
  join(SRC, "app", "layout.tsx"),
];

/**
 * Modules that may never reach a CLIENT'S BROWSER.
 *
 * Each is either a staff-only registry, a staff-only write path, or a surface
 * that renders a colleague's email. Paths are repo-relative and matched exactly,
 * so a rename fails loudly here instead of quietly widening what a Client is
 * sent.
 *
 * ⚠️ THE SET IS THE CLIENT BUNDLE, NOT THE WHOLE IMPORT GRAPH, AND THE
 * DIFFERENCE IS REAL. `services/staff.ts` IS reachable from this route on the
 * server — `client-report.ts` → `analytics.ts` → `clients.ts` → `staff.ts`,
 * where the last hop exists so STAFF screens can resolve a writer's email. None
 * of those modules is `"use client"`, so none of them is downloaded by anybody,
 * and asserting on the raw graph would have failed on a chain that ships
 * nothing. What must be empty is the half that crosses into the browser.
 */
const FORBIDDEN = [
  "src/services/industries.ts",
  "src/services/staff.ts",
  "src/lib/client-writer.ts",
  "src/components/dashboard/client/client-industry-writer-card.tsx",
  "src/components/dashboard/client/add-client-dialog.tsx",
  "src/components/dashboard/client/columns.tsx",
  "src/components/dashboard/settings/industries-table.tsx",
  "src/app/(app)/clients/[id]/industry-writer-actions.ts",
  "src/app/(app)/settings/industries/actions.ts",
  "src/app/(app)/settings/industries/page.tsx",
];

const CACHE = new Map<string, string | null>();
function read(path: string): string | null {
  if (!CACHE.has(path)) {
    try {
      CACHE.set(path, readFileSync(path, "utf8"));
    } catch {
      CACHE.set(path, null);
    }
  }
  return CACHE.get(path) ?? null;
}

/** The file a specifier names, or null for a bare package (`react`, `next/…`). */
function resolveSpecifier(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolvePath(join(fromFile, ".."), spec);
  else return null;

  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (/\.tsx?$/.test(candidate) && read(candidate) !== null) return candidate;
  }
  return null;
}

/** Every VALUE import specifier in a module — type-only clauses are dropped. */
function valueImports(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/import\s+([\s\S]*?)\s*from\s*["']([^"']+)["']/g)) {
    if (/^\s*type\s/.test(m[1]!)) continue;
    out.push(m[2]!);
  }
  // `import "./globals.css"` and other side-effect imports carry no bindings but
  // still pull the module in.
  for (const m of source.matchAll(/import\s*["']([^"']+)["']/g)) out.push(m[1]!);
  return out;
}

/**
 * The `"use client"` directive, which must be a module's first statement.
 *
 * ⚠️ A LINEAR SCANNER, NOT A REGEX. `rsc-boundary.test.ts` carries the same one
 * and the reason with it: the obvious regex was flagged twice as exponential
 * backtracking (`js/redos`, CWE-1333), and this file reads real source on every
 * run. Skip whitespace, skip `//` lines, skip block comments, then look.
 */
function isClientModule(source: string): boolean {
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i += 1;
    } else if (source.startsWith("//", i)) {
      const nl = source.indexOf("\n", i);
      if (nl === -1) return false;
      i = nl + 1;
    } else if (source.startsWith("/*", i)) {
      const end = source.indexOf("*/", i + 2);
      if (end === -1) return false;
      i = end + 2;
    } else {
      break;
    }
  }
  return source.startsWith('"use client"', i) || source.startsWith("'use client'", i);
}

interface Walk {
  /** Every module the route reaches at all, server and browser alike. */
  all: Set<string>;
  /** The subset that crosses into the browser: a client module, or below one. */
  bundled: Set<string>;
}

/**
 * Walk the route's import graph, marking what is downloaded.
 *
 * ⚠️ ONCE INSIDE A CLIENT MODULE, EVERYTHING BELOW IT IS BUNDLED TOO — including
 * modules that look server-shaped. That is the whole reason `"use client"` is
 * dangerous to sprinkle, and it is what `rsc-boundary.test.ts` guards elsewhere.
 */
function walk(): Walk {
  const all = new Set<string>();
  const bundled = new Set<string>();
  const queue: { file: string; inClient: boolean }[] = ENTRIES.map((file) => ({
    file,
    inClient: false,
  }));

  while (queue.length > 0) {
    const { file, inClient } = queue.pop()!;
    const rel = relative(process.cwd(), file);
    const source = read(file);
    if (source === null) continue;

    const client = inClient || isClientModule(source);
    // Re-visit a module already seen as server-only if it is now reached
    // through a client boundary — the second visit is what marks it bundled.
    if (all.has(rel) && (!client || bundled.has(rel))) continue;
    all.add(rel);
    if (client) bundled.add(rel);

    for (const spec of valueImports(source)) {
      const target = resolveSpecifier(file, spec);
      if (target !== null) queue.push({ file: target, inClient: client });
    }
  }
  return { all, bundled };
}

/** The surfaces that decide what a Client is actually shown. */
const REPORT_SURFACE = [
  ...ENTRIES.filter((f) => f.startsWith(ROUTE)),
  join(SRC, "components", "report-link", "public-report.tsx"),
  join(SRC, "services", "client-report.ts"),
];

describe("the client report ships no staff-only module", () => {
  const { all, bundled } = walk();

  it("walks a real graph, so a passing result cannot be vacuous", () => {
    // ⚠️ THE GUARD ON THE GUARD. If the entries move or the resolver stops
    // resolving, every forbidden module is trivially absent and this file turns
    // into a test that asserts nothing while still reading green.
    for (const entry of ENTRIES) {
      expect(all.has(relative(process.cwd(), entry)), entry).toBe(true);
    }
    expect(all.size).toBeGreaterThan(10);
    // …and the client half must be real too, or the assertion below is empty.
    expect(bundled.size).toBeGreaterThan(0);
  });

  it("⚠️ downloads neither the industries registry, the staff directory, nor a writer surface", () => {
    const leaks = FORBIDDEN.filter((module) => bundled.has(module));

    expect(leaks, `a Client's browser must not receive: ${leaks.join(", ")}`).toEqual([]);
  });

  it("⚠️ the report's own surfaces never mention either field", () => {
    // The bundle check covers modules; this covers a hand-written leak inside
    // the report itself — a label, a prop, a select — which would show up as no
    // import at all. Both fields are staff-only (D3): a Client is never told
    // which industry Arcbound files them under, nor who writes for them.
    for (const file of REPORT_SURFACE) {
      const source = read(file) ?? "";
      expect(source, file).not.toMatch(/\bindustry\b/i);
      expect(source, file).not.toMatch(/\bwriter\b/i);
    }
  });
});
