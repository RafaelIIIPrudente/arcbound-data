import type { cookies } from "next/headers";
import type { CookieOptions } from "@supabase/ssr";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { config } from "@/config";

export function createClient(cookieStore: ReturnType<typeof cookies>): SupabaseClient {
  // Use the DEFAULT @supabase/ssr cookie configuration — identical to
  // client.ts (createBrowserClient) and middleware.ts (createServerClient). A
  // previous custom `cookieOptions: { name: "sb", … }` here read/wrote a
  // different cookie than the browser/middleware set at login, so RSC seams
  // never saw the session and ran as `anon` (bi "permission denied", empty
  // Clients). All three clients now share one cookie config.
  return createServerClient(config.supabase.url!, config.supabase.anonKey!, {
    cookies: {
      async get(name: string) {
        const store = await cookieStore;
        return store.get(name)?.value;
      },
      async set(name: string, value: string, options: CookieOptions) {
        try {
          const store = await cookieStore;
          store.set({ name, value, ...options });
        } catch (error) {
          // The `set` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
      async remove(name: string, options: CookieOptions) {
        try {
          const store = await cookieStore;
          store.set({ name, value: "", ...options });
        } catch (error) {
          // The `delete` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
  });
}
