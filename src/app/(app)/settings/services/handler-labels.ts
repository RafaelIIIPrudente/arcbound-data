import type { ServiceHandler } from "@/services/types";

/**
 * The pipelines an admin may choose from, and how they read on screen.
 *
 * ⚠️ A `Record<ServiceHandler, …>` ON PURPOSE — IT IS EXHAUSTIVE BY CONSTRUCTION.
 * Adding a handler to the union without adding it here is a TYPE ERROR, so the
 * picker cannot silently fall behind the code. The database's CHECK constraint is
 * the third copy of this list and the one that cannot be bypassed; these two are
 * what stop a screen offering a pipeline nobody wrote.
 *
 * ⚠️ LIVES OUTSIDE `actions.ts` ON PURPOSE. That file is `"use server"`, and
 * Next.js requires every export of a `"use server"` file to be an async function —
 * a plain object export there fails at runtime: `A "use server" file can only
 * export async functions, found object.`
 */
export const HANDLER_LABELS: Record<ServiceHandler, string> = {
  linkedin_post_metrics: "LinkedIn post metrics",
  outreach_prospects: "Outreach prospects",
};

export const HANDLER_VALUES = Object.keys(HANDLER_LABELS) as [ServiceHandler, ...ServiceHandler[]];
