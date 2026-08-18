"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/roles";
import { paths } from "@/paths";
import { setClientIndustryWriter } from "@/services/clients";

// ─────────────────────────────────────────────────────────────────────────────
// Record a Client's Industry and Writer. Admin-only twice over: this action calls
// `requireAdmin()`, and `set_client_industry_writer` re-checks `public.is_admin()`
// in SQL, raising 42501.
//
// ⚠️ `await requireAdmin()` IS FIRST AND OUTSIDE THE try. It denies by calling
// `redirect()`, which denies by THROWING — inside the try it would be caught and
// rendered as a message reading "NEXT_REDIRECT" instead of redirecting.
//
// ═════════════════════════════════════════════════════════════════════════════
// ⚠️ THE RPC APPLIES BOTH ARGUMENTS, INCLUDING NULL. THERE IS NO PARTIAL UPDATE.
//
// Sending only the field the admin changed ERASES the other one — no error, no
// trace, and nothing downstream to notice. So this action requires BOTH fields to
// be PRESENT in the submission and forwards them unaltered.
//
// ⚠️ ABSENT ≠ EMPTY, AND CONFLATING THEM IS THE WHOLE BUG. On the wire, "not
// recorded" is an empty string from a control that rendered; a MISSING key means
// some form forgot to submit a field it should have. Those are indistinguishable
// once both become `null`, so absence is refused outright rather than obeyed. A
// future form that drops a field gets a loud error instead of silent data loss.
// ═════════════════════════════════════════════════════════════════════════════
//
// ⚠️ THIS ACTION CANNOT REACH `clients.name` OR `clients.linkedin_url`, and that
// is the point. It calls one function that names exactly two columns; the table
// has no UPDATE policy, so there is no other route. `name` is the key
// `bi.linkedin_post_latest` joins scraped posts on — editing it silently
// re-attributes or strands every post a Client has, which cost fourteen posts on
// 2026-08-18.
// ─────────────────────────────────────────────────────────────────────────────

export type IndustryWriterState =
  { status: "idle" } | { status: "saved"; message: string } | { status: "error"; message: string };

/**
 * An unset picker posts `""`. That is a real answer — "not recorded" — and the
 * column is nullable to hold it, so it becomes `null` for the RPC.
 */
const optionalId = (label: string) =>
  z
    .union([z.literal(""), z.string().uuid(label)])
    .transform((value) => (value === "" ? null : value));

const schema = z.object({
  clientId: z.string().uuid("Select a valid client."),
  industryId: optionalId("Select a valid industry."),
  writerId: optionalId("Select a valid writer."),
});

export async function setClientIndustryWriterAction(
  _prev: IndustryWriterState,
  formData: FormData,
): Promise<IndustryWriterState> {
  await requireAdmin();

  // ⚠️ PRESENCE IS CHECKED BEFORE VALUE. See the block above: a missing key is a
  // broken form, not a cleared field, and obeying it would be the silent wipe.
  if (!formData.has("industry_id") || !formData.has("writer_id")) {
    return {
      status: "error",
      message:
        "The industry and the writer must be submitted together — saving one without the other would clear it.",
    };
  }

  const parsed = schema.safeParse({
    clientId: formData.get("client_id"),
    industryId: formData.get("industry_id"),
    writerId: formData.get("writer_id"),
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const { clientId, industryId, writerId } = parsed.data;

  try {
    await setClientIndustryWriter(clientId, industryId, writerId);
    revalidatePath(paths.clients.details(clientId));
    // The Client List reads both fields too (S5), so its cached render would
    // otherwise keep showing what was just replaced.
    revalidatePath(paths.clients.list);
    return { status: "saved", message: "Saved." };
  } catch (err) {
    // Verbatim — the database's own refusal is the entire explanation the admin
    // gets, and replacing it with a generic message throws that away.
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
