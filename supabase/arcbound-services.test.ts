import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THESE ARE SOURCE ASSERTIONS, NOT EXECUTED SQL.
//
// No Postgres runs in this repo's test suite. Nothing here proves the schema
// BEHAVES correctly — only that the shipped script still SAYS what it is supposed
// to say. The constraints, the guards, the seed and the backfill are all
// unverified until a human applies the script.
//
// It earns its place anyway, because these are exactly the invariants that get
// "tidied" away by someone who does not know why they exist: the partial index
// looks like it should be a plain unique, the missing cascade looks like an
// oversight, and `update_service`'s missing handler parameter looks like a bug.
// Each of those edits is silent — the SQL stays valid and the app keeps working.
// Every assertion below has been mutation-checked to confirm it can fail.
// ─────────────────────────────────────────────────────────────────────────────

const SCRIPT = join(process.cwd(), "supabase", "arcbound-services.sql");
const source = readFileSync(SCRIPT, "utf8");

/** One function's definition, from its `create or replace` line to `$$;`. */
function fnBody(name: string): string {
  const start = source.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} not found in the script`).toBeGreaterThan(-1);
  const end = source.indexOf("\n$$;", start);
  expect(end, `${name} has no terminator`).toBeGreaterThan(start);
  return source.slice(start, end);
}

const FUNCTIONS = [
  "create_service",
  "update_service",
  "set_service_status",
  "delete_service",
  "set_client_services",
  "list_services_admin",
];

describe("the script is readable (guard the guard)", () => {
  it("defines both tables and all six functions", () => {
    // A wrong path or empty read would make every assertion below vacuous.
    expect(source).toContain("create table if not exists public.services");
    expect(source).toContain("create table if not exists public.client_services");
    for (const fn of FUNCTIONS) {
      expect(source, fn).toContain(`create or replace function public.${fn}(`);
    }
  });

  it("tells the operator to run verification queries one at a time", () => {
    // The Supabase SQL editor renders only the LAST statement's result set, and
    // the seed and backfill are both silent no-ops when they match nothing.
    expect(source).toMatch(/ONE AT A TIME/i);
  });
});

describe("services — the registry", () => {
  it("⚠️ allows only handlers that exist in code, and allows NULL", () => {
    // ⚠️ VISIBILITY IS DATA, CAPABILITY IS CODE. A row can never invent a
    // pipeline: the legal set is fixed here. NULL stays legal because "listed but
    // not ingestible" is a real offering, not an error or an absence.
    expect(source).toMatch(
      /handler is null or handler in \('linkedin_post_metrics', 'outreach_prospects'\)/,
    );
  });

  it("constrains status to active/archived", () => {
    expect(source).toMatch(/status in \('active', 'archived'\)/);
  });

  it("⚠️ permits at most ONE Service per pipeline, via a PARTIAL unique index", () => {
    // ⚠️ THE `where handler is not null` IS LOAD-BEARING IN BOTH DIRECTIONS.
    //
    // Without the index, two Services could claim `linkedin_post_metrics` and
    // render two identical upload tabs writing to one table, with nothing
    // downstream able to tell their data apart. Without the WHERE, every
    // no-pipeline Service after the first would be rejected — Arcbound could list
    // exactly one non-ingesting offering, for ever.
    expect(source).toMatch(
      /create unique index if not exists services_one_per_handler\s*\n\s*on public\.services \(handler\) where handler is not null;/,
    );
  });

  it("has RLS on with a select-only policy and no write policy", () => {
    expect(source).toMatch(/alter table public\.services enable row level security;/);
    expect(source).toMatch(/create policy services_select_authenticated on public\.services/);
    // Writes go exclusively through the SECURITY DEFINER functions.
    expect(source).not.toMatch(/on public\.services\s*\n\s*for (insert|update|delete)/);
  });
});

describe("client_services — the engagements", () => {
  it("⚠️ does NOT cascade on service_id, so the FK enforces the delete guard", () => {
    // ⚠️ THE ABSENCE IS THE FEATURE. With `on delete cascade`, deleting a Service
    // would silently wipe every engagement referencing it. The default RESTRICT
    // means the database refuses on its own — the guard survives the application
    // layer being bypassed entirely.
    const table = source.slice(
      source.indexOf("create table if not exists public.client_services"),
      source.indexOf("alter table public.client_services"),
    );

    expect(table).toMatch(/service_id uuid not null references public\.services\(id\),/);
    // The client_id FK DOES cascade; only service_id must not.
    expect(table).toMatch(
      /client_id\s+uuid not null references public\.clients\(id\) on delete cascade/,
    );
    expect(table).not.toMatch(/references public\.services\(id\) on delete cascade/);
  });

  it("is keyed on the pair, so an assignment cannot be duplicated", () => {
    expect(source).toMatch(/primary key \(client_id, service_id\)/);
  });

  it("has RLS on with a select-only policy", () => {
    expect(source).toMatch(/alter table public\.client_services enable row level security;/);
    expect(source).toMatch(
      /create policy client_services_select_authenticated on public\.client_services/,
    );
  });
});

describe("every mutating function is admin-guarded", () => {
  it.each(FUNCTIONS)("%s raises 42501 for a non-admin", (fn) => {
    const body = fnBody(fn);
    expect(body).toMatch(/if not public\.is_admin\(\) then/);
    expect(body).toMatch(/errcode\s*=\s*'42501'/);
  });

  it.each(FUNCTIONS)("%s guards BEFORE it touches any table", (fn) => {
    const body = fnBody(fn);
    const guard = body.indexOf("is_admin()");
    // The first statement that reads or writes a public table.
    const firstTouch = body.search(/\b(insert into|update|delete from|from) public\./);
    expect(guard).toBeGreaterThan(-1);
    if (firstTouch > -1) expect(guard).toBeLessThan(firstTouch);
  });

  it.each(FUNCTIONS)("%s is security definer with a pinned search_path", (fn) => {
    const body = fnBody(fn);
    expect(body).toMatch(/security definer/);
    expect(body).toMatch(/set search_path = public/);
  });
});

describe("update_service cannot repoint a live Service", () => {
  it("⚠️ takes NO handler parameter — the handler is immutable after creation", () => {
    // ⚠️ THE OMISSION IS THE DESIGN. Repointing a Service at another pipeline
    // would silently reinterpret every engagement already attached to it: Clients
    // recorded as receiving one service would, with no row changing, be recorded
    // as receiving another, and every historical count would change meaning
    // retroactively with nothing to show it happened. Archive and re-create.
    const signature = source.slice(
      source.indexOf("create or replace function public.update_service("),
      source.indexOf(")\nreturns void", source.indexOf("public.update_service(")),
    );

    expect(signature).not.toMatch(/p_handler/);
    expect(signature).toMatch(/p_id\s+uuid/);
    expect(signature).toMatch(/p_sort_order\s+int/);
  });

  it("⚠️ stamps updated_at, because no trigger will", () => {
    // ⚠️ `services.updated_at` HAS NO TRIGGER (same as staff_roles). Omitting this
    // leaves the column lying about a row that genuinely changed.
    expect(fnBody("update_service")).toMatch(/updated_at\s*=\s*now\(\)/);
  });
});

describe("set_service_status archives rather than destroys", () => {
  it("rejects a status outside the two known values", () => {
    expect(fnBody("set_service_status")).toMatch(
      /p_status not in \('active', 'archived'\)[\s\S]*?errcode\s*=\s*'22023'/,
    );
  });

  it("stamps updated_at", () => {
    expect(fnBody("set_service_status")).toMatch(/updated_at\s*=\s*now\(\)/);
  });
});

describe("delete_service refuses while anyone receives the Service", () => {
  it("⚠️ counts references and raises 23503 naming the count", () => {
    // ⚠️ HARD DELETE IS A TYPO ERASER, NOT A RETIREMENT TOOL. This message is for
    // humans; the FK is what actually enforces it (see the client_services test).
    const body = fnBody("delete_service");

    expect(body).toMatch(/count\(\*\) into v_refs[\s\S]*?from public\.client_services/);
    expect(body).toMatch(/if v_refs > 0 then[\s\S]*?errcode\s*=\s*'23503'/);
  });

  it("checks the references BEFORE deleting", () => {
    const body = fnBody("delete_service");
    expect(body.indexOf("v_refs > 0")).toBeLessThan(body.indexOf("delete from public.services"));
  });
});

describe("set_client_services replaces the set idempotently", () => {
  it("stamps created_by from the calling admin", () => {
    expect(fnBody("set_client_services")).toMatch(/auth\.uid\(\)/);
  });

  it("⚠️ treats a NULL array as 'none' rather than deleting nothing", () => {
    // ⚠️ `service_id <> all(null)` IS NULL, NOT TRUE — without the explicit null
    // branch, clearing a Client's services would silently do nothing at all.
    expect(fnBody("set_client_services")).toMatch(
      /p_service_ids is null or service_id <> all \(p_service_ids\)/,
    );
  });

  it("is idempotent on re-submission", () => {
    expect(fnBody("set_client_services")).toMatch(
      /on conflict \(client_id, service_id\) do nothing/,
    );
  });
});

describe("list_services_admin derives upload_count from the handler", () => {
  const body = fnBody("list_services_admin");

  it("⚠️ maps each handler to its own table, and NULL to zero", () => {
    // ⚠️ NOT A JOIN, AND IT CANNOT BE. Neither uploads table carries a
    // `service_id`, and adding one would change the `ingest_metrics` signature
    // (which needs DROP FUNCTION first — a trap this repo has already hit). The
    // mapping is exact because the partial unique index guarantees at most one
    // Service per handler.
    expect(body).toMatch(
      /when 'linkedin_post_metrics' then \(select count\(\*\) from public\.uploads\)/,
    );
    expect(body).toMatch(
      /when 'outreach_prospects'\s+then \(select count\(\*\) from public\.outreach_uploads\)/,
    );
    expect(body).toMatch(/else 0::bigint/);
  });

  it("counts clients with a LEFT JOIN so a Service with none still appears", () => {
    // A Service nobody receives is exactly the one an admin may want to delete;
    // an inner join would hide it.
    expect(body).toMatch(/left join \(/);
    expect(body).toMatch(/coalesce\(cc\.n, 0\)/);
  });
});

describe("the seed and backfill state only what is true", () => {
  it("seeds exactly the two code-backed Services, idempotently", () => {
    expect(source).toMatch(/'linkedin-growth', 'LinkedIn Growth'/);
    expect(source).toMatch(/'outreach-system', 'Outreach System'/);
    // `do nothing`, never `do update`: a re-apply must not undo a staff rename.
    expect(source).toMatch(/on conflict \(slug\) do nothing;/);
  });

  it("⚠️ backfills from real upload history, not from an assumption", () => {
    // ⚠️ EVERY ASSIGNMENT MUST BE EVIDENCE-BACKED. A Client gets a Service only
    // because ArcBase already holds an upload of that kind for them. Once /upload
    // filters by Services, a Client with none has no upload path — so a backfill
    // that guessed, or that assigned nothing, would be an outage.
    expect(source).toMatch(/select distinct u\.client_id, s\.id[\s\S]*?from public\.uploads u/);
    expect(source).toMatch(
      /select distinct o\.client_id, s\.id[\s\S]*?from public\.outreach_uploads o/,
    );
    expect(source).toMatch(/on conflict do nothing;/);
  });

  it("tells the operator what the engagement count must equal", () => {
    // A count that silently came back lower than (c)+(d)−overlap is the failure
    // mode; the script must say so rather than leaving it to be noticed later.
    expect(source).toMatch(/count\(distinct client_id\) from public\.uploads/);
    expect(source).toMatch(/count\(distinct client_id\) from public\.outreach_uploads/);
    expect(source).toMatch(/intersect/);
  });
});
