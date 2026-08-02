"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/roles";
import { paths } from "@/paths";
import { issueReportLink, revokeReportLink, rotateReportLink } from "@/services/report-links";
import type { IssuedReportLink } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Staff Report Link actions — thin server-action wrappers over the S1 service.
// Bind the clientId with `.bind(null, clientId)` in the card (same idiom as the
// gate action). No new service functions and no DB read here beyond the service.
//
// ⚠️ THE ACCESS CODE IS ONE-TIME. issue/rotate return `IssuedReportLink`
// ({url, accessCode}); this action hands it straight to the card's action-state
// so the code is shown ONCE. It is never persisted, re-fetched, or logged — a
// `revalidatePath` re-render reads `getReportLink`, which carries no code by
// construction, so the code cannot reappear on a plain render.
//
// ⚠️ `await requireAdmin()` IS THE FIRST STATEMENT AND SITS OUTSIDE THE try.
//
// Issuing, rotating and revoking are Admin acts (ADR 0013): each one mints or
// destroys a credential a person outside Arcbound holds. Two things about the
// placement are load-bearing:
//   • BEFORE the try — `requireAdmin()` denies by calling `redirect()`, which
//     signals by THROWING. Inside the try it would be caught by the catch below,
//     turned into `{status: "error"}`, and the redirect would never happen: the
//     user would sit on the page reading a control-flow token as if it were a
//     server fault. The tests assert the throw escapes.
//   • NOT THE ONLY GUARD — this is the app-layer half. `issue/rotate/revoke_
//     report_link` each re-check `public.is_admin()` in SQL, so a caller who
//     skips the app entirely and uses their own Supabase token is still refused.
//     Neither layer makes the other redundant.
// ─────────────────────────────────────────────────────────────────────────────

export type ReportLinkActionState =
  | { status: "idle" }
  | { status: "issued"; link: IssuedReportLink }
  | { status: "revoked" }
  | { status: "error"; message: string };

function errorState(err: unknown): ReportLinkActionState {
  return { status: "error", message: err instanceof Error ? err.message : String(err) };
}

/** Create the client's single active Report Link; surface its one-time code. */
export async function createReportLinkAction(
  clientId: string,
  _prev: ReportLinkActionState,
  _formData: FormData,
): Promise<ReportLinkActionState> {
  await requireAdmin();
  try {
    const link = await issueReportLink(clientId);
    revalidatePath(paths.clients.details(clientId));
    return { status: "issued", link };
  } catch (err) {
    return errorState(err);
  }
}

/** Revoke the active link and issue a fresh one; surface the new one-time code. */
export async function rotateReportLinkAction(
  clientId: string,
  _prev: ReportLinkActionState,
  _formData: FormData,
): Promise<ReportLinkActionState> {
  await requireAdmin();
  try {
    const link = await rotateReportLink(clientId);
    revalidatePath(paths.clients.details(clientId));
    return { status: "issued", link };
  } catch (err) {
    return errorState(err);
  }
}

/** Deactivate the client's link; the card flips back to the Create state. */
export async function revokeReportLinkAction(
  clientId: string,
  _prev: ReportLinkActionState,
  _formData: FormData,
): Promise<ReportLinkActionState> {
  await requireAdmin();
  try {
    await revokeReportLink(clientId);
    revalidatePath(paths.clients.details(clientId));
    return { status: "revoked" };
  } catch (err) {
    return errorState(err);
  }
}
