import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { CookieOptions } from "@supabase/ssr";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { config } from "@/config";

type ResponseCookie = Pick<CookieOptions, "httpOnly" | "maxAge" | "priority">;

/**
 * Creates the middleware Supabase client and its pass-through response.
 *
 * `nonce`/`csp` are threaded onto the forwarded REQUEST headers (so Next.js
 * auto-nonces its framework scripts) and the CSP is set on the RESPONSE, without
 * changing the cookie-refresh behavior: each response is rebuilt from the current
 * (cookie-updated) request headers.
 */
export function createClient(
  req: NextRequest,
  nonce: string,
  csp: string,
): {
  supabaseClient: SupabaseClient;
  res: NextResponse;
} {
  const buildResponse = () => {
    const headers = new Headers(req.headers);
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", csp);
    const response = NextResponse.next({ request: { headers } });
    response.headers.set("Content-Security-Policy", csp);
    return response;
  };

  let res = buildResponse();

  const supabaseClient = createServerClient(config.supabase.url!, config.supabase.anonKey!, {
    cookies: {
      get(name: string) {
        return req.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        // If the cookie is updated, update the cookies for the request and response
        req.cookies.set({ name, value, ...(options as Partial<ResponseCookie>) });
        res = buildResponse();
        res.cookies.set({ name, value, ...(options as Partial<ResponseCookie>) });
      },
      remove(name: string, options: CookieOptions) {
        // If the cookie is removed, update the cookies for the request and response
        req.cookies.set({ name, value: "", ...(options as Partial<ResponseCookie>) });
        res = buildResponse();
        res.cookies.set({ name, value: "", ...(options as Partial<ResponseCookie>) });
      },
    },
  });

  return { supabaseClient, res };
}
