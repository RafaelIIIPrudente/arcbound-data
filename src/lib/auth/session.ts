import { cache } from "react";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";

import { isSupabaseConfigured } from "@/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Returns the current authenticated Supabase user, or `null`.
 * Safe to call from Server Components, Route Handlers, and Server Actions.
 * Returns `null` when Supabase isn't configured (auth disabled).
 *
 * MEMOISED PER REQUEST. `auth.getUser()` is a network round-trip to Supabase,
 * and the session is read more than once while rendering a single page — the
 * app shell checks it in `(app)/layout.tsx`, and `/settings` reads it again in
 * the page — so an unmemoised call cost two round-trips to render one screen.
 *
 * ⚠️ THE SCOPE IS THE SECURITY PROPERTY, NOT AN IMPLEMENTATION DETAIL.
 *
 * React's `cache()` is REQUEST-scoped: the memo lives for one server render and
 * is discarded with it, so one visitor's session can never be handed to
 * another. It takes no arguments, so a request has exactly one entry.
 *
 * This must NOT be swapped for `unstable_cache`, `revalidate`, or any store
 * that persists BETWEEN requests. Those are keyed by input, and since this
 * function has no inputs, every visitor would share one entry — the first
 * user's identity would be served to everyone until it expired. A source guard
 * in session.test.ts asserts that substitution has not been made, because
 * nothing else would catch it.
 */
export const getSession = cache(async (): Promise<User | null> => {
  if (!isSupabaseConfigured) return null;
  const supabase = createClient(cookies());
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
});
