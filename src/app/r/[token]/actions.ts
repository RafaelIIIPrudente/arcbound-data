"use server";

import { redirect } from "next/navigation";

import {
  bumpAttempts,
  clearAttempts,
  currentAttempts,
  grantGateSession,
  isAttemptCapReached,
} from "@/lib/report-link-session";
import { paths } from "@/paths";
import { resolveReportLink } from "@/services/report-links";

/**
 * The gate's user-facing state, returned to the client form (useActionState).
 *
 * ⚠️ TWO FAILURE STATES, NEVER MORE. `invalid` is the SINGLE generic error for a
 * bad URL AND a bad code — the wording must never reveal which. `locked` is the
 * rate-limit state ("try again later"). There is deliberately no "wrong code" vs
 * "unknown link" distinction: that would be an auth oracle.
 */
export interface GateState {
  status: "idle" | "invalid" | "locked";
}

/**
 * Verify a submitted Access Code for `token`. Bind `token` with `.bind(null,
 * token)` in the client form.
 *
 * Flow (fails closed at every branch):
 *   1. App-layer cap FIRST — short-circuit to `locked` before any DB call.
 *   2. A blank code is a failed attempt, handled WITHOUT a DB round-trip.
 *   3. `resolveReportLink` → ok: mint the gate cookie (carrying the resolved
 *      clientId), clear the attempt counter, redirect to the view. locked: show
 *      the lockout message. invalid: bump the app counter, show the generic error.
 */
export async function submitAccessCode(
  token: string,
  _prev: GateState,
  formData: FormData,
): Promise<GateState> {
  const code = String(formData.get("code") ?? "").trim();

  // 1. Belt-and-suspenders app cap, on top of the DB lockout in resolve.
  if (isAttemptCapReached(await currentAttempts(token))) {
    return { status: "locked" };
  }

  // 2. A blank code cannot be valid — count it, but don't waste a DB round-trip
  //    (or a DB lockout slot) on it. Same generic outcome as any wrong code.
  if (code === "") {
    await bumpAttempts(token);
    return { status: "invalid" };
  }

  // 3. The authoritative verify + lockout lives in the definer function.
  const result = await resolveReportLink(token, code);

  if (result.ok) {
    // Seal the read grant (minted by resolve on THIS success) into the signed
    // gate cookie — the view reads the report source with it. Never in the URL.
    await grantGateSession(token, result.clientId, result.readGrant);
    await clearAttempts(token);
    redirect(paths.reportLink(token));
  }

  if (result.reason === "locked") {
    return { status: "locked" };
  }

  await bumpAttempts(token);
  return { status: "invalid" };
}
