import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { reportLinkSecret } from "@/env.server";
import { paths } from "@/paths";

// ─────────────────────────────────────────────────────────────────────────────
// Report Link gate session. A Client who passes the Access Code gate at
// `/r/<token>` gets a short-lived, signed, httpOnly cookie so they don't re-enter
// the code on every navigation. The viewer is NOT an ArcBase user — this cookie
// is a capability proof for ONE token, nothing more.
//
// Design:
//   • The cookie VALUE is `body.signature`, where body is base64url-encoded JSON
//     `{ t: token, c: clientId, e: exp }` and signature = HMAC-SHA256 over the
//     body with the server secret. The signature binds the WHOLE payload, so a
//     cookie minted for token A can't authorise token B, the expiry can't be
//     pushed forward, and the clientId can't be swapped — all without the secret.
//     Binding the clientId lets the route render the report WITHOUT re-resolving
//     (the Access Code was proven once, at the gate) and WITHOUT a second DB read.
//   • httpOnly + Secure (prod) + SameSite=Lax, path-scoped to `/r/<token>` so the
//     browser only ever sends it back to that one link.
//   • The signing core (mint/verify) is PURE and takes the secret as an argument,
//     so it is fully unit-testable and the secret never leaks into a bundle. The
//     I/O helpers below read the secret from the server-only env and use
//     `next/headers` cookies — server code only.
// ─────────────────────────────────────────────────────────────────────────────

const GATE_COOKIE = "arcbase_rl_gate";
const ATTEMPTS_COOKIE = "arcbase_rl_attempts";

/** Gate session lifetime: ~2 hours. */
export const GATE_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * App-layer attempt cap, on top of the DB lockout in resolve_report_link. This is
 * belt-and-suspenders: it lives in a per-visitor signed cookie a client could
 * clear, so the DB lockout remains the authoritative control. It exists to blunt
 * rapid guessing before a request ever reaches the database.
 */
export const MAX_ATTEMPTS = 10;

function b64urlHmac(input: string, secret: string): string {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

/** Constant-time string compare that never throws on length mismatch. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// ── pure signing core (secret injected — no env, no cookies) ──────────────────

interface GatePayload {
  /** The token this session authorises. */
  t: string;
  /** The Client whose report may be rendered — resolved once, at the gate. */
  c: string;
  /** The short-lived READ GRANT — the second factor to the data (see the SQL). */
  g: string;
  /** Expiry, ms since epoch. */
  e: number;
}

/** What a valid gate cookie authorises: one Client, and the grant to read it. */
export interface GateSession {
  clientId: string;
  grant: string;
}

/**
 * A signed gate cookie value binding `token` + `clientId` + read `grant` until
 * `exp` (ms). Format `base64url(json).signature`. The signature binds the WHOLE
 * payload, so none of token/client/grant/expiry can be swapped without the secret.
 */
export function mintGateValue(
  token: string,
  clientId: string,
  grant: string,
  exp: number,
  secret: string,
): string {
  const body = Buffer.from(JSON.stringify({ t: token, c: clientId, g: grant, e: exp })).toString(
    "base64url",
  );
  return `${body}.${b64urlHmac(body, secret)}`;
}

/**
 * The bound `{clientId, grant}` iff `value` is a well-formed, unexpired gate
 * cookie whose signature matches under `secret` AND whose payload names `token`.
 * Any malformed input, wrong token, forged/expired payload, or bad signature is
 * `null` — fail closed. The caller reads the report for the returned clientId
 * using the returned grant, and nothing else.
 */
export function readGateSession(
  value: string | undefined,
  opts: { token: string; now: number; secret: string },
): GateSession | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot <= 0 || dot === value.length - 1) return null;
  const body = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (!safeEqual(sig, b64urlHmac(body, opts.secret))) return null;
  let payload: GatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as GatePayload;
  } catch {
    return null;
  }
  if (payload.t !== opts.token) return null;
  if (!Number.isFinite(payload.e) || payload.e <= opts.now) return null;
  if (typeof payload.c !== "string" || payload.c === "") return null;
  if (typeof payload.g !== "string" || payload.g === "") return null;
  return { clientId: payload.c, grant: payload.g };
}

// ── app-layer attempt counter (signed, per token) ────────────────────────────

function attemptsSignature(token: string, count: number, secret: string): string {
  return b64urlHmac(`attempts.${token}.${count}`, secret);
}

/** A signed attempts cookie value for `token`. Format `count.sig`. */
export function mintAttemptsValue(token: string, count: number, secret: string): string {
  return `${count}.${attemptsSignature(token, count, secret)}`;
}

/**
 * The verified attempt count for `token`, or 0 for any missing/tampered/wrong-token
 * value. Returning 0 on tamper is safe: it only defers to the authoritative DB
 * lockout — a client can lower their own count but not raise a victim's.
 */
export function readAttempts(
  value: string | undefined,
  opts: { token: string; secret: string },
): number {
  if (!value) return 0;
  const dot = value.indexOf(".");
  if (dot <= 0) return 0;
  const count = Number(value.slice(0, dot));
  const sig = value.slice(dot + 1);
  if (!Number.isInteger(count) || count < 0) return 0;
  if (!safeEqual(sig, attemptsSignature(opts.token, count, opts.secret))) return 0;
  return count;
}

/** True once the app-layer cap is reached — short-circuit to a lockout message. */
export function isAttemptCapReached(count: number): boolean {
  return count >= MAX_ATTEMPTS;
}

// ── server cookie I/O (reads the server-only secret; fails closed) ────────────

function cookieOptions(token: string) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    // Scope to this one link so the browser never sends it to another token or
    // to the rest of the (authenticated) app.
    path: paths.reportLink(token),
  };
}

/**
 * Mint + set the gate cookie binding `token` to `clientId` and the read `grant`.
 * Throws if the secret is unconfigured (the caller runs after a successful
 * resolve, so this is the happy path; a throw here surfaces as the gate's generic
 * error → fail closed).
 */
export async function grantGateSession(
  token: string,
  clientId: string,
  grant: string,
): Promise<void> {
  const secret = reportLinkSecret();
  const exp = Date.now() + GATE_TTL_MS;
  const store = await cookies();
  store.set(GATE_COOKIE, mintGateValue(token, clientId, grant, exp, secret), {
    ...cookieOptions(token),
    maxAge: Math.floor(GATE_TTL_MS / 1000),
  });
}

/** The current request's valid gate session for `token`, or `null`. Fails closed. */
async function currentGateSession(token: string): Promise<GateSession | null> {
  try {
    const secret = reportLinkSecret();
    const store = await cookies();
    return readGateSession(store.get(GATE_COOKIE)?.value, {
      token,
      now: Date.now(),
      secret,
    });
  } catch {
    return null;
  }
}

/**
 * The `clientId` the current request is authorised to view for `token`, or `null`
 * if there is no valid gate cookie. FAILS CLOSED. Used by the route to decide
 * gate-vs-view.
 */
export async function getGateClientId(token: string): Promise<string | null> {
  return (await currentGateSession(token))?.clientId ?? null;
}

/**
 * The read GRANT the current request carries for `token`, or `null`. FAILS CLOSED.
 * Used by the view to fetch the report source through the token+grant read.
 */
export async function getGateReadGrant(token: string): Promise<string | null> {
  return (await currentGateSession(token))?.grant ?? null;
}

/**
 * The current app-layer attempt count for `token` (0 on any error). Used to
 * short-circuit the gate before hitting the DB when guessing is rapid.
 */
export async function currentAttempts(token: string): Promise<number> {
  try {
    const secret = reportLinkSecret();
    const store = await cookies();
    return readAttempts(store.get(ATTEMPTS_COOKIE)?.value, { token, secret });
  } catch {
    return 0;
  }
}

/** Increment and persist the signed attempt counter for `token`. */
export async function bumpAttempts(token: string): Promise<number> {
  try {
    const secret = reportLinkSecret();
    const store = await cookies();
    const next = readAttempts(store.get(ATTEMPTS_COOKIE)?.value, { token, secret }) + 1;
    store.set(ATTEMPTS_COOKIE, mintAttemptsValue(token, next, secret), {
      ...cookieOptions(token),
      maxAge: 15 * 60, // aligns with the DB's 15-minute lockout window
    });
    return next;
  } catch {
    return 0;
  }
}

/** Clear the attempt counter (called on a successful gate pass). */
export async function clearAttempts(token: string): Promise<void> {
  try {
    const store = await cookies();
    store.set(ATTEMPTS_COOKIE, "", { ...cookieOptions(token), maxAge: 0 });
  } catch {
    // best-effort — a stale counter only expires itself
  }
}
