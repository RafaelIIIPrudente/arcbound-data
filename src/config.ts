import { env } from "@/env";
import { AuthStrategy } from "@/lib/auth/strategy";
import { getSiteURL } from "@/lib/get-site-url";
import { LogLevel } from "@/lib/logger";

export interface Config {
  site: {
    name: string;
    description: string;
    url: string;
    version?: string;
  };
  logLevel: keyof typeof LogLevel;
  auth: { strategy: keyof typeof AuthStrategy };
  supabase: { url?: string; anonKey?: string };
}

export const config = {
  site: {
    name: "ArcBase",
    description: "Internal LinkedIn post-metrics dashboard for Arcbound staff.",
    url: getSiteURL(),
    version: env.NEXT_PUBLIC_SITE_VERSION,
  },
  logLevel: env.NEXT_PUBLIC_LOG_LEVEL ?? LogLevel.ALL,
  auth: {
    strategy: env.NEXT_PUBLIC_AUTH_STRATEGY ?? AuthStrategy.SUPABASE,
  },
  supabase: {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
} satisfies Config;

// Fact: are the Supabase env vars present? NEXT_PUBLIC_* vars are inlined at
// build time, so this is fixed for a given build.
export const isSupabaseConfigured = Boolean(
  env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

/**
 * Policy: may the browsable "auth disabled" bypass apply? Only when Supabase is
 * unconfigured AND we are not in production. In production an unconfigured
 * Supabase fails CLOSED (protected routes redirect to sign-in), so a build that
 * ships without env vars can never silently open the app to anonymous users.
 * Pure and exported for testing — see config.test.ts.
 */
export function computeAuthDisabled(configured: boolean, nodeEnv: string | undefined): boolean {
  return !configured && nodeEnv !== "production";
}

// When Supabase env vars are absent in DEVELOPMENT only, auth is disabled and the
// whole app is browsable without a backend (useful for local UI work). Consumed
// by middleware.ts and the app shell layout.
export const authDisabled = computeAuthDisabled(isSupabaseConfigured, env.NODE_ENV);

// Loud fail-closed warning: a production build missing Supabase env vars still
// enforces auth, but no one can sign in until the vars are set.
if (env.NODE_ENV === "production" && !isSupabaseConfigured) {
  console.error(
    "[config] Supabase env vars missing in production — auth is enforced (fail-closed): " +
      "protected routes redirect to sign-in and no one can sign in until " +
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.",
  );
}
