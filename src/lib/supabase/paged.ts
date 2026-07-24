// ─────────────────────────────────────────────────────────────────────────────
// THE ONE PAGED READER. Every read that wants a WHOLE table goes through here.
//
// ⚠️ POSTGREST CAPS A RESPONSE AT 1000 ROWS, SILENTLY. A `.select()` with no
// `.range()` does not error above the cap — it returns 1000 rows and a 200. So
// an unpaged all-table read looks like working software while reporting numbers
// that are quietly short, which is the worst failure this codebase can produce.
//
// This module exists because that defect had already been fixed once, in the
// report's bi read, and then reappeared twice in reads written afterwards
// (`fetchPostCounts` and `latestUploadByClient`). One implementation cannot
// regress in one place and not another.
//
// THE DIVISION OF LABOUR: this module owns the LOOP — how many pages, in what
// order, and what to do when one of them fails. Each reader owns its own RANGED
// REQUEST, because only the caller knows its table, its columns, and its
// filters. So `grep -rn "\.range(" src` finds this file plus one call per
// reader, and that is correct: pulling the request construction in here would
// couple the pager to schemas it has no business knowing.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rows per request — PostgREST's own cap. Not a tuning knob: asking for more
 * does not get more.
 */
export const PAGE_SIZE = 1000;

/**
 * Hard ceiling on pages per read — 50,000 rows. Exported so tests assert the cap
 * the module actually enforces rather than restating the number.
 */
export const MAX_PAGES = 50;

/** One page's worth of PostgREST response, narrowed to what the pager reads. */
export interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
  count?: number | null;
}

/**
 * Builds and issues ONE page request.
 *
 * `opts` is passed for page 0 only, to ask for the count that sizes the rest.
 *
 * ⚠️ THE READER MUST APPLY A STABLE `.order()`. Pages 1..n are issued
 * CONCURRENTLY, and without a total order the database may return overlapping
 * or skipped rows across ranges — a silently wrong row set rather than an error.
 */
export type PageReader<T> = (
  from: number,
  to: number,
  opts?: { count: "exact" },
) => PromiseLike<PageResult<T>>;

/**
 * Adapt a Supabase query builder to the `PageResult<T>` a `PageReader` returns.
 *
 * ⚠️ THIS IS THE ONLY TYPE ASSERTION IN THE DATA-ACCESS PATH, AND IT IS HERE SO
 * THERE IS EXACTLY ONE OF IT.
 *
 * It cannot be avoided today. The envelope is fine — `PostgrestResponse` really
 * does carry `{ data, error, count }`, and its error really does have a
 * `message` — but the ROW TYPE cannot be inferred: this repo has no generated
 * database types for the `bi` schema, and every reader passes its column list as
 * a RUNTIME STRING, so the builder's element type is unknowable at compile time.
 *
 * ⚠️ WHAT THIS COSTS, STATED PLAINLY: `T` is asserted, not checked. Change a
 * reader's `.select()` column list and nothing here will complain — the shape
 * keeps claiming whatever `T` says. That is a real hole, and it is the reason
 * this lives in one documented place instead of being copy-pasted at each
 * reader, where three copies would drift apart silently.
 *
 * The fix that would remove it entirely is generated types covering `bi.*`
 * (`pnpm db:types` does not reach that schema today). Until then, treat each
 * reader's column list and its row type as a pair that must be edited together.
 */
export function asPage<T>(builder: PromiseLike<unknown>): PromiseLike<PageResult<T>> {
  return builder as PromiseLike<PageResult<T>>;
}

export interface PagedRead<T> {
  rows: T[];
  /** The read FAILED — `rows` is empty and means nothing. */
  unavailable: boolean;
  /** The read SUCCEEDED but hit MAX_PAGES — `rows` is incomplete. */
  truncated: boolean;
}

/**
 * Read every page of a table, or say honestly why not.
 *
 * Three outcomes, and callers must keep them apart:
 *   • `unavailable` — the read broke. `rows` is meaningless.
 *   • `truncated`   — the read worked but stopped at the cap. `rows` is a
 *                     PREFIX, so any total computed from it is short.
 *   • neither       — `rows` is the complete table.
 *
 * `label` is the human noun used in warnings, e.g. "bi.linkedin_post_latest".
 */
export async function readAllPages<T>(read: PageReader<T>, label: string): Promise<PagedRead<T>> {
  let rows: T[] = [];
  let truncated = false;

  try {
    // Page 0 carries the count that sizes the rest, so it is the one read that
    // genuinely has to go first.
    //
    // The count must be "exact". "planned" and "estimated" are PostgREST's cheap
    // approximations, and an under-estimate would compute too few pages and drop
    // rows silently — the failure this paging exists to prevent.
    const firstPage = await read(0, PAGE_SIZE - 1, { count: "exact" });
    if (firstPage.error) {
      console.warn(`${label} read failed: ${firstPage.error.message}`);
      return { rows: [], unavailable: true, truncated: false };
    }

    rows = firstPage.data ?? [];
    // A null count would mean the server ignored the option; fall back to what
    // page 0 actually returned rather than guessing at a total.
    const total = firstPage.count ?? rows.length;

    let pageCount = Math.ceil(total / PAGE_SIZE);
    if (pageCount > MAX_PAGES) {
      // The console warning is for operators; `truncated` is for the UI. A
      // warning alone was the old behaviour, and it meant a truncated read still
      // rendered as a complete one on screen.
      console.warn(
        `${label} read truncated — ${total} rows, above the ${MAX_PAGES * PAGE_SIZE}-row ` +
          `read cap (${MAX_PAGES} pages × ${PAGE_SIZE}). Reading the first ${MAX_PAGES * PAGE_SIZE}.`,
      );
      pageCount = MAX_PAGES;
      truncated = true;
    }

    if (pageCount > 1) {
      // `Promise.all` preserves INPUT order, so the pages concatenate 1..n after
      // page 0 regardless of which returns first. Do not swap it for a construct
      // that resolves out of order.
      const rest = await Promise.all(
        Array.from({ length: pageCount - 1 }, (_, i) => {
          const from = (i + 1) * PAGE_SIZE;
          return read(from, from + PAGE_SIZE - 1);
        }),
      );

      // ⚠️ SCAN EVERY PAGE BEFORE USING ANY OF THEM.
      //
      // Supabase RESOLVES with `{ error }` rather than rejecting, so a failed
      // page arrives looking like a normal result while its siblings hold real
      // rows. Concatenating what succeeded would report a partial table as a
      // complete one — a silent wrong number, which is worse than the
      // unavailable banner because it looks like data.
      for (const { error } of rest) {
        if (error) {
          console.warn(`${label} read failed: ${error.message}`);
          return { rows: [], unavailable: true, truncated: false };
        }
      }

      for (const { data } of rest) rows = rows.concat(data ?? []);
    }
  } catch (err) {
    console.warn(`${label} read failed: ${err instanceof Error ? err.message : String(err)}`);
    return { rows: [], unavailable: true, truncated: false };
  }

  return { rows, unavailable: false, truncated };
}
