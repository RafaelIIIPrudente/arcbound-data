export interface CspOptions {
  /** Dev enables 'unsafe-eval' (HMR) and local Supabase/websocket origins. */
  isDev: boolean;
  /** When set, its https + wss origins are added to connect-src. */
  supabaseUrl?: string;
}

/**
 * Builds an enforced, nonce-based strict Content-Security-Policy string.
 *
 * Pure function of its arguments (no `process.env` reads) so it is trivially
 * testable and identical wherever it runs. Scripts use nonce + 'strict-dynamic'
 * with NO 'unsafe-inline'; styles allow 'unsafe-inline' (shadcn/Radix set inline
 * style attributes — per Google's strict-CSP guidance).
 */
export function buildCsp(nonce: string, opts: CspOptions): string {
  const { isDev, supabaseUrl } = opts;

  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    // HMR in dev evaluates code via eval(); never allowed in production.
    ...(isDev ? ["'unsafe-eval'"] : []),
  ];

  const connectSrc = ["'self'"];
  if (supabaseUrl) {
    try {
      const url = new URL(supabaseUrl);
      connectSrc.push(url.origin, `wss://${url.host}`);
    } catch {
      // Ignore a malformed Supabase URL — connect-src simply stays 'self'.
    }
  }
  if (isDev) {
    // Local Supabase CLI (http) + the HMR websocket.
    connectSrc.push("ws:", "http://127.0.0.1:54321");
  }

  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    ["script-src", scriptSrc],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", "https:"]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", connectSrc],
    ["frame-ancestors", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["object-src", ["'none'"]],
  ];

  return directives.map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
}
