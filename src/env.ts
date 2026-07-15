import { z } from "zod";

/**
 * Single source of truth for environment variables: a zod-validated, fail-fast
 * `env`. Import `env` instead of reading `process.env` directly — that removes
 * the `process.env.X!` non-null-assertion class and silent `as`/`|| default`
 * casts that let a misconfiguration surface late (e.g. the auth fail-open).
 *
 * Every variable here is PUBLIC (`NEXT_PUBLIC_*`) or `NODE_ENV`; this template
 * has no server-only secrets today. If one is ever added, split this into
 * separate server and client schemas (t3-env style) and validate them apart, so
 * server secrets are never referenced from — and thus never inlined into — the
 * client bundle.
 *
 * Optional-but-validated: the template must still run with Supabase absent (the
 * auth-disabled dev mode), so the Supabase vars are `.optional()`, not required.
 */
/**
 * A set-but-empty env var (`""`) — common in Docker/CI, where it usually means
 * "unset" — should behave as absent, not as an invalid value. Coerce `""` to
 * `undefined` BEFORE validation, so empty passes `.optional()` while a genuinely
 * invalid non-empty value (e.g. `"notaurl"`) still hard-fails.
 */
function optionalEnv<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema);
}

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: optionalEnv(z.string().url().optional()),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalEnv(z.string().min(1).optional()),
  NEXT_PUBLIC_SITE_URL: optionalEnv(z.string().url().optional()),
  NEXT_PUBLIC_SITE_VERSION: optionalEnv(z.string().optional()),
  NEXT_PUBLIC_LOG_LEVEL: optionalEnv(z.enum(["NONE", "ERROR", "WARN", "DEBUG", "ALL"]).optional()),
  NEXT_PUBLIC_AUTH_STRATEGY: optionalEnv(z.literal("SUPABASE").optional()),
  NEXT_PUBLIC_VERCEL_URL: optionalEnv(z.string().optional()),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

/** The validated, typed environment. */
export type Env = z.infer<typeof envSchema>;

/**
 * Pure: validate a raw environment object. On failure, throws a fail-fast Error
 * whose message names every invalid/missing key. Exported for testing.
 */
export function parseEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment variables — ${details}`);
  }
  return result.data;
}

// Next.js inlines `NEXT_PUBLIC_*` statically BY NAME at build time; `process.env`
// is not a real object in the client bundle. So reference each variable by its
// literal name here (never spread `process.env`) and validate that explicit object
// at import — a misconfiguration then fails the build/boot loudly, not later.
export const env = parseEnv({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SITE_VERSION: process.env.NEXT_PUBLIC_SITE_VERSION,
  NEXT_PUBLIC_LOG_LEVEL: process.env.NEXT_PUBLIC_LOG_LEVEL,
  NEXT_PUBLIC_AUTH_STRATEGY: process.env.NEXT_PUBLIC_AUTH_STRATEGY,
  NEXT_PUBLIC_VERCEL_URL: process.env.NEXT_PUBLIC_VERCEL_URL,
  NODE_ENV: process.env.NODE_ENV,
});
