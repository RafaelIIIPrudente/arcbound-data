import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

import { authDisabled, isSupabaseConfigured } from "@/config";
import { env } from "@/env";
import { buildCsp } from "@/lib/csp";
import { isPublicRoute, routeAccess } from "@/lib/route-access";
import { createClient } from "@/lib/supabase/middleware";
import { paths } from "@/paths";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Per-request CSP nonce. Edge-safe Web Crypto only (no Node Buffer).
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, {
    isDev: env.NODE_ENV !== "production",
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
  });

  // Forwarded request headers carry the nonce + CSP so Next.js auto-nonces its
  // own framework scripts. A pass-through response also sets the CSP response
  // header. Every return path below applies the CSP — no path is missed.
  const passThrough = () => {
    const headers = new Headers(req.headers);
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", csp);
    const response = NextResponse.next({ request: { headers } });
    response.headers.set("Content-Security-Policy", csp);
    return response;
  };

  const redirectTo = (path: string, cookieSource?: NextResponse) => {
    const url = req.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    const redirect = NextResponse.redirect(url);
    redirect.headers.set("Content-Security-Policy", csp);
    // Preserve refreshed auth cookies on the redirect when a source is given.
    if (cookieSource) {
      cookieSource.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    }
    return redirect;
  };

  // Dev-only: no Supabase configured → auth disabled, let every request through.
  if (authDisabled) {
    return passThrough();
  }

  // Production without Supabase config → fail CLOSED. There is no client to
  // create, so gate every non-public route directly and leave the login /
  // password-reset screens reachable.
  if (!isSupabaseConfigured) {
    if (!isPublicRoute(pathname)) {
      return redirectTo(paths.login);
    }
    return passThrough();
  }

  const { supabaseClient, res } = createClient(req, nonce, csp);

  // Refreshes the session cookie on every matched request. If Supabase is
  // unreachable, treat the request as unauthenticated rather than erroring.
  let user: User | null = null;
  try {
    const result = await supabaseClient.auth.getUser();
    user = result.data.user;
  } catch {
    user = null;
  }

  // Single-tenant auth gate: every route but `/login` (and the retained auth
  // callback / password-reset routes) requires a session; a signed-in user on
  // `/login` is bounced to the home dashboard. See src/lib/route-access.ts.
  const decision = routeAccess(pathname, Boolean(user));
  if (decision.type === "redirect") {
    return redirectTo(decision.to, res);
  }

  // res already carries the nonce request headers + CSP response header.
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
