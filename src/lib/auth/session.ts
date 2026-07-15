import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";

import { isSupabaseConfigured } from "@/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Returns the current authenticated Supabase user, or `null`.
 * Safe to call from Server Components, Route Handlers, and Server Actions.
 * Returns `null` when Supabase isn't configured (auth disabled).
 */
export async function getSession(): Promise<User | null> {
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
}
