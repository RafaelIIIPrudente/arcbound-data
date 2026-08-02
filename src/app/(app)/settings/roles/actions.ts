"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/roles";
import { paths } from "@/paths";
import { setStaffRole } from "@/services/staff";

// ─────────────────────────────────────────────────────────────────────────────
// Staff Role assignment (ADR 0013). Admin-only, twice over: this action calls
// `requireAdmin()`, and `set_staff_role` re-checks `public.is_admin()` in SQL so
// a caller who skips the app and uses their own Supabase token is still refused.
//
// ⚠️ `await requireAdmin()` IS THE FIRST STATEMENT AND SITS OUTSIDE THE try.
// This action catches failures deliberately — that is how the database's refusal
// reaches the screen — so a guard inside the try would be caught too, and the
// denial would render as a message reading "NEXT_REDIRECT" instead of redirecting.
//
// ⚠️ IT DOES NOT KNOW THE LAST-ADMIN RULE, AND MUST NOT LEARN IT. `set_staff_role`
// refuses any change leaving zero admins and says so in human words; this action
// carries that text back unchanged. Re-deriving the rule here to pre-empt the call
// would create a second copy that drifts from the first — and the copy users see
// is the one that drifts first.
// ─────────────────────────────────────────────────────────────────────────────

export type SetStaffRoleState =
  { status: "idle" } | { status: "saved" } | { status: "error"; message: string };

const schema = z.object({
  user_id: z.string().uuid("Select a valid staff account."),
  // Mirrors the CHECK constraint on `public.staff_roles`. The database is still
  // the authority; this only keeps an obviously bad value off the wire.
  role: z.enum(["admin", "analyst"], { message: "Role must be Admin or Data Analyst." }),
});

export async function setStaffRoleAction(
  _prev: SetStaffRoleState,
  formData: FormData,
): Promise<SetStaffRoleState> {
  await requireAdmin();

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  try {
    await setStaffRole(parsed.data.user_id, parsed.data.role);
    revalidatePath(paths.settings.roles);
    return { status: "saved" };
  } catch (err) {
    // Verbatim: this is where the last-admin refusal becomes visible.
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
