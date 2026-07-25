import { z } from "zod";

/**
 * Server-ONLY environment. This is the FIRST server secret in ArcBase — the note
 * in `src/env.ts` calls for exactly this split: a schema kept apart from the
 * `NEXT_PUBLIC_*` client schema so the value is never referenced from, and thus
 * never inlined into, the client bundle. Import this ONLY from server code
 * (today: `src/lib/report-link-session.ts`, itself server-only via `next/headers`).
 *
 * `REPORT_LINK_SIGNING_SECRET` signs the short-lived gate cookie behind the public
 * Report Link (`/r/<token>`). It is:
 *   • OPTIONAL AT IMPORT — validated but not required, so a build/test/dev run
 *     without it does not crash at module load (Next imports route modules to
 *     build them). A MISSING secret instead fails the gate CLOSED at call time
 *     (see `reportLinkSecret()`), which denies rather than granting.
 *   • MIN LENGTH 32 when present — a short HMAC key is a weak one. There is
 *     deliberately NO fallback/default value: a predictable signing key would let
 *     anyone forge a gate cookie.
 */
function optionalEnv<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema);
}

const serverEnvSchema = z.object({
  REPORT_LINK_SIGNING_SECRET: optionalEnv(z.string().min(32).optional()),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Pure: validate a raw environment object. On failure (e.g. a present-but-too-
 * short secret) throws a fail-fast Error naming the key. Exported for testing.
 */
export function parseServerEnv(raw: Record<string, unknown>): ServerEnv {
  const result = serverEnvSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid server environment variables — ${details}`);
  }
  return result.data;
}

export const serverEnv = parseServerEnv({
  REPORT_LINK_SIGNING_SECRET: process.env.REPORT_LINK_SIGNING_SECRET,
});

/**
 * The gate-cookie signing secret, or throw if unconfigured.
 *
 * ⚠️ THE CALLERS CATCH THIS AND FAIL CLOSED. Throwing here (rather than returning
 * a fallback) means a misconfigured deployment can mint/verify NO gate cookies,
 * so the public gate denies everyone — the safe direction — instead of signing
 * with a guessable key.
 */
export function reportLinkSecret(): string {
  const secret = serverEnv.REPORT_LINK_SIGNING_SECRET;
  if (!secret) {
    throw new Error("REPORT_LINK_SIGNING_SECRET is not configured");
  }
  return secret;
}
