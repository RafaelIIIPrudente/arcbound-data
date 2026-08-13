import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// THE RSC BOUNDARY, ENFORCED RATHER THAN DOCUMENTED.
//
// ⚠️ A "use client" DIRECTIVE CONVERTS EVERY EXPORT OF A MODULE INTO A CLIENT
// REFERENCE — not just the components. A Server Component that imports a
// CONSTANT from a client module does not receive the constant. It receives a
// proxy, and the first property access on it throws at request time.
//
// This is the defect that shipped: `src/app/(app)/page.tsx` imported
// `PRESET_DAYS` from `dashboard-filters.tsx` ("use client"), and
// `decodeRange`'s `presets.includes(days)` threw on `/?range=7d` and
// `/?range=90d`. `?range=30d` never travelled (the encoder stripped the
// default) and `?range=all` returned before the whitelist was read, so the two
// URLs anybody actually opened worked — and the crash reached an external
// reviewer instead of the first person to click a preset.
//
// ⚠️ NOTHING ELSE CATCHES THIS. `next build` never executes a dynamic route, so
// the build is green; under Vitest the directive is inert, so every unit test is
// green; and it does not fail on the URL the default produces. A prose ⚠️ in one
// folder did not stop another folder claiming exemption from the same rule —
// which is precisely why the guard is a test and not a comment.
//
// `report-period.test.ts` pins the same rule for ONE module. This pins it for
// the whole of `src/`.
// ─────────────────────────────────────────────────────────────────────────────

const SRC = join(process.cwd(), "src");

/** Every non-test TypeScript module under `src/`, repo-relative. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    // ⚠️ TESTS ARE EXCLUDED AS IMPORTERS, DELIBERATELY AND NARROWLY. A test file
    // is never rendered by the server, and the directive is inert under Vitest,
    // so a test importing a constant from a client module is not the defect this
    // guard is about. They are still scanned as TARGETS — a client module is a
    // client module however it is reached.
    if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

const FILES = sourceFiles(SRC);

/** The `"use client"` directive, which must be the module's first statement. */
function isClientModule(source: string): boolean {
  return /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*|\s)*["']use client["']/.test(source);
}

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

/**
 * The file a specifier names, or null for a bare package.
 *
 * Only `@/…` (the tsconfig alias for `src/`) and relative specifiers can reach a
 * module in this repo, so a bare `react` needs no resolution.
 */
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

type Imported = { name: string; kind: "named" | "default" | "namespace" };

/**
 * The value bindings a module imports from each specifier.
 *
 * Type-only imports are dropped: `import type { X }` and an inline `{ type X }`
 * are erased before the code ever runs, so they cross no boundary.
 */
function importsOf(source: string): { spec: string; bindings: Imported[] }[] {
  const out: { spec: string; bindings: Imported[] }[] = [];
  const RE = /import\s+([\s\S]*?)\s*from\s*["']([^"']+)["']/g;

  for (const m of source.matchAll(RE)) {
    const clause = m[1]!;
    const spec = m[2]!;
    if (/^\s*type\s/.test(clause)) continue; // `import type { … } from`

    const bindings: Imported[] = [];

    const ns = /^\s*\*\s+as\s+(\w+)\s*$/.exec(clause);
    if (ns) {
      bindings.push({ name: ns[1]!, kind: "namespace" });
      out.push({ spec, bindings });
      continue;
    }

    const braced = /\{([\s\S]*)\}/.exec(clause);
    if (braced) {
      for (const piece of braced[1]!.split(",")) {
        const raw = piece.trim();
        if (raw === "" || /^type\s/.test(raw)) continue;
        // `a as b` — the ORIGINAL name is what identifies the export.
        bindings.push({ name: raw.split(/\s+as\s+/)[0]!.trim(), kind: "named" });
      }
    }

    // A default import is whatever precedes the brace or ends the clause.
    const head = (braced ? clause.slice(0, braced.index) : clause).replace(/,\s*$/, "").trim();
    if (head !== "" && /^\w+$/.test(head)) bindings.push({ name: head, kind: "default" });

    if (bindings.length > 0) out.push({ spec, bindings });
  }
  return out;
}

type Classification = "type" | "component" | "function" | "data" | "unknown";

/**
 * What an exported name IS in its own module — the classifier this guard turns on.
 *
 * ⚠️ THIS IS BETTER THAN "IS THE NAME PascalCase?", WHICH IS THE OBVIOUS SWEEP
 * AND THE WRONG ONE. It reads the DECLARATION, so `export const DefaultConfig =
 * { … }` in a client module is caught as data even though its name looks like a
 * component, and `export const DASHBOARD_PRESETS = [ … ]` is caught for what it
 * is rather than for how it is spelled.
 *
 *   type      — erased at compile time; crosses nothing.
 *   component — a PascalCase function; an RSC may RENDER a client reference.
 *   function  — a camelCase function; an RSC would have to CALL it, and cannot.
 *   data      — a plain value; an RSC reading it gets a proxy, then throws.
 */
function classifyExport(source: string, name: string): Classification {
  const n = name.replace(/[$]/g, "\\$&");
  if (new RegExp(`export\\s+(?:type|interface)\\s+${n}\\b`).test(source)) return "type";

  const isComponentName = /^[A-Z]/.test(name);

  // `export function X` and, via `grouped` below, a plain `function X` that a
  // trailing `export { X }` publishes — the shape every vendored shadcn/ui
  // module uses, and a real hole in this guard until it was handled.
  const grouped = isGroupExported(source, name);
  const fn = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${n}\\b`).exec(source);
  if (fn && (grouped || fn[0].startsWith("export"))) {
    return isComponentName ? "component" : "function";
  }

  const decl = new RegExp(`(export\\s+)?(?:const|let|var)\\s+${n}\\b([^\\n]*)`).exec(source);
  if (decl && (grouped || decl[1] !== undefined)) {
    const tail = decl[2]!;
    // An arrow, a `function` expression, or a React wrapper (forwardRef/memo)
    // is callable; anything else — array, object, string, number — is data.
    const callable = /=>|=\s*(?:async\s+)?function\b|forwardRef|React\.memo|\bmemo\(/.test(tail);
    if (!callable) return "data";
    return isComponentName ? "component" : "function";
  }

  return "unknown";
}

/**
 * Whether a trailing `export { … }` publishes this name from THIS module.
 *
 * ⚠️ A LIST CARRYING `from` IS DELIBERATELY NOT COUNTED. `export { X } from
 * "./y"` re-exports someone else's binding, and following that chain is not
 * something this textual scan does — so the name stays unclassified and the
 * hole fails loudly rather than being waved through as safe.
 */
function isGroupExported(source: string, name: string): boolean {
  for (const m of source.matchAll(/export\s*\{([^}]*)\}\s*(from\s*["'][^"']+["'])?/g)) {
    if (m[2] !== undefined) continue;
    const names = m[1]!.split(",").map((p) =>
      p
        .trim()
        .split(/\s+as\s+/)
        .pop()!
        .trim(),
    );
    if (names.includes(name)) return true;
  }
  return false;
}

interface Violation {
  importer: string;
  target: string;
  binding: string;
  why: string;
}

function scan(): { violations: Violation[]; unclassified: Violation[] } {
  const violations: Violation[] = [];
  const unclassified: Violation[] = [];

  for (const file of FILES) {
    const source = read(file)!;
    // A client module importing from a client module is the normal case: both
    // sides already run on the client, so nothing crosses the boundary.
    if (isClientModule(source)) continue;

    for (const { spec, bindings } of importsOf(source)) {
      const target = resolveSpecifier(file, spec);
      if (target === null) continue;
      const targetSource = read(target)!;
      if (!isClientModule(targetSource)) continue;

      for (const binding of bindings) {
        const where = {
          importer: relative(process.cwd(), file),
          target: relative(process.cwd(), target),
          binding: binding.name,
        };

        if (binding.kind === "namespace") {
          violations.push({
            ...where,
            why: `namespace import of a "use client" module — every property access is a client reference`,
          });
          continue;
        }
        // A default import is the conventional shape of a component import
        // (`import Chart from "./chart"`), and cannot be classified when the
        // target re-exports it. Treated as a component; see the limits test.
        if (binding.kind === "default") continue;

        const kind = classifyExport(targetSource, binding.name);
        if (kind === "type" || kind === "component") continue;
        if (kind === "unknown") {
          unclassified.push({ ...where, why: "export not found in the target module" });
          continue;
        }
        violations.push({
          ...where,
          why:
            kind === "data"
              ? 'plain data from a "use client" module — the importer receives a proxy, not the value'
              : 'a non-component function from a "use client" module — a server module cannot CALL a client reference',
        });
      }
    }
  }
  return { violations, unclassified };
}

function render(v: Violation): string {
  return `${v.importer} ← ${v.target} :: ${v.binding} — ${v.why}`;
}

describe('nothing outside a "use client" module imports a non-component from one', () => {
  it("finds no such import anywhere in src/", () => {
    // ⚠️ THE FIX FOR THIS FAILURE IS NEVER "RE-EXPORT IT FROM THE CLIENT
    // MODULE". Move the value into a plain module with NO directive and have
    // BOTH sides import it from there — `dashboard-range.ts` and
    // `report-period.ts` are the two worked examples in this repo.
    const { violations } = scan();

    expect(violations.map(render)).toEqual([]);
  });

  it("classifies every named import it meets, so nothing is skipped in silence", () => {
    // An unresolved export means the classifier met a shape it does not know
    // (a re-export chain, most likely) and let it through. That is a HOLE in
    // the guard, so it fails here rather than passing quietly.
    const { unclassified } = scan();

    expect(unclassified.map(render)).toEqual([]);
  });
});

describe("the guard's own reach — proved, not asserted", () => {
  it("actually scanned this repo's modules, both client and server", () => {
    // Guard the guard: a broken walk or a wrong root would make every
    // assertion above vacuously true.
    const clients = FILES.filter((f) => isClientModule(read(f)!));

    expect(FILES.length).toBeGreaterThan(100);
    expect(clients.length).toBeGreaterThan(10);
  });

  it("detects the exact defect that shipped, on a reconstruction of it", () => {
    // The real `page.tsx ← dashboard-filters :: PRESET_DAYS` shape, so the
    // classifier is shown catching it rather than trusted to.
    const client = ['"use client";', "export const PRESET_DAYS = [7, 30, 90];"].join("\n");

    expect(isClientModule(client)).toBe(true);
    expect(classifyExport(client, "PRESET_DAYS")).toBe("data");
  });

  it("does not fire on the imports that are legitimately fine", () => {
    const client = [
      '"use client";',
      "export function DateRangePicker() { return null; }",
      "export type PresetOption = { key: string };",
      "export const useThing = () => 1;",
      "export const Card = (props: unknown) => props;",
      "export const DefaultConfig = { a: 1 };",
    ].join("\n");

    // A PascalCase FUNCTION is a component an RSC may render.
    expect(classifyExport(client, "DateRangePicker")).toBe("component");
    // A type is erased before anything runs.
    expect(classifyExport(client, "PresetOption")).toBe("type");
    // An arrow component is still a component.
    expect(classifyExport(client, "Card")).toBe("component");
    // ⚠️ AND THE TWO THAT A NAME-CASING SWEEP WOULD GET WRONG, IN BOTH
    // DIRECTIONS: a camelCase FUNCTION is not safe just because it is not
    // PascalCase-data, and a PascalCase CONSTANT is not safe just because it
    // looks like a component.
    expect(classifyExport(client, "useThing")).toBe("function");
    expect(classifyExport(client, "DefaultConfig")).toBe("data");
  });

  it("reads a name published by a trailing `export { … }`, not just `export function`", () => {
    // The shape every vendored shadcn/ui module uses. Before this was handled,
    // 19 imports of `Table`/`Toaster` came back unclassified — the guard was
    // blind to them, which is a hole whether or not they were violations.
    const client = [
      '"use client";',
      "function Table(props: unknown) { return props; }",
      "const PAGE_SIZES = [10, 20];",
      "export { Table, PAGE_SIZES };",
    ].join("\n");

    expect(classifyExport(client, "Table")).toBe("component");
    expect(classifyExport(client, "PAGE_SIZES")).toBe("data");
    // A re-export chain is NOT followed, and says so by staying unknown.
    expect(classifyExport('export { A } from "./b";', "A")).toBe("unknown");
    // A local, unexported declaration is not an export either.
    expect(classifyExport("const PRIVATE = [1];", "PRIVATE")).toBe("unknown");
  });

  it("reads a directive that sits under a leading comment", () => {
    expect(isClientModule('// a note\n"use client";\nexport const x = 1;')).toBe(true);
    expect(isClientModule('export const notClient = "use client";')).toBe(false);
  });

  it("states what it still cannot see", () => {
    // ⚠️ HONEST LIMITS, PINNED SO A LATER READER DOES NOT OVER-TRUST THIS GUARD:
    //
    //   • DEFAULT IMPORTS are assumed to be components. `import X from` a client
    //     module is the conventional component shape and is not flagged.
    //   • RE-EXPORT CHAINS are not followed. `export { A } from "./b"` in the
    //     target makes the binding unclassified — which FAILS the second test
    //     above rather than passing silently, so the hole is loud, not silent.
    //   • DYNAMIC `import()` is not inspected; only static import statements.
    //   • TEST FILES are not scanned as importers (they are never server-
    //     rendered, and the directive is inert under Vitest).
    //   • The scan is TEXTUAL, not an AST walk: a specifier built at runtime, or
    //     an import written inside a template literal, is invisible to it.
    //
    // This assertion exists so those limits live in the file that has them.
    expect(importsOf('const s = "./x"; await import(s);')).toEqual([]);
    expect(importsOf('import type { A } from "./a";')).toEqual([]);
    expect(importsOf('import { type A, b } from "./a";')).toEqual([
      { spec: "./a", bindings: [{ name: "b", kind: "named" }] },
    ]);
  });
});
