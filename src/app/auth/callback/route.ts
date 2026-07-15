import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { paths } from "@/paths";

// Exchanges the OAuth / email-link PKCE `code` for a session, then redirects.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? paths.dashboard.overview;

  if (code) {
    const supabase = createClient(cookies());
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}${paths.auth.signIn}?error=auth_callback`);
}
