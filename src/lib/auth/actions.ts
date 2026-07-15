"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { isSupabaseConfigured } from "@/config";
import { createClient } from "@/lib/supabase/server";
import { paths } from "@/paths";

export async function signOut() {
  // Only touch Supabase when it's actually configured; swallow an unreachable
  // backend so signing out always lands the user on the sign-in screen.
  if (isSupabaseConfigured) {
    try {
      const supabase = createClient(cookies());
      await supabase.auth.signOut();
    } catch {
      // Backend unreachable — the intent is to sign out, so continue.
    }
  }
  // Outside the try: redirect() throws NEXT_REDIRECT by design.
  redirect(paths.auth.signIn);
}
