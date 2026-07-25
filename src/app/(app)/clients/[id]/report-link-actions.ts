"use server";

import { revalidatePath } from "next/cache";

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
  try {
    await revokeReportLink(clientId);
    revalidatePath(paths.clients.details(clientId));
    return { status: "revoked" };
  } catch (err) {
    return errorState(err);
  }
}
