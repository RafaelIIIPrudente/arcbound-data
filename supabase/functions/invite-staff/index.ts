// ArcBase — invite-staff (Supabase Edge Function, Deno)
//
// Invites a new staff member by email and assigns their Staff Role (ADR 0013,
// ADR 0014). Invoked from the Next.js service seam (`src/services/staff.ts`),
// never from the browser.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THIS FUNCTION EXISTS SO THE SERVICE-ROLE KEY NEVER ENTERS THE NEXT APP.
//
// `inviteUserByEmail` is a GoTrue admin operation. It cannot be done from SQL, and
// it cannot be done with the anon key — it requires the service-role key, which is
// not "a key with more permissions": it BYPASSES RLS ON EVERY TABLE, including the
// third-party prospect PII in the Outreach tables (ADR 0012). If that key lived in
// `src/env.server.ts` it would sit in the Next runtime and in Vercel's environment,
// so any compromise of the web app would become a compromise of the entire
// database. Here it is injected by Supabase into this one function's runtime,
// reachable only through this one narrow, admin-gated entry point.
//
// ⚠️ AUTHORISE FROM THE CALLER, EXECUTE WITH THE KEY. NEVER CONFLATE THEM.
//
// Two clients below, in a fixed order, and the order is the security property:
//   1. The CALLER client — anon key, carrying the caller's own Authorization
//      header — answers "is this person an admin?" via `is_admin()`. It is the ONLY
//      thing that decides authorisation. A service-role client CANNOT answer this
//      question at all: it has no session, so `auth.uid()` is null and `is_admin()`
//      is false for it by construction.
//   2. The SERVICE-ROLE client is created only AFTER that check passes, and is used
//      for exactly two operations: the invite, and the `staff_roles` insert.
//
// The key never decides anything. It only executes what the caller was already
// entitled to.
// ─────────────────────────────────────────────────────────────────────────────
//
// NOT COVERED BY THE REPO'S TEST SUITE. This is Deno; vitest does not run it. The
// Next side is tested with `functions.invoke` mocked, but nothing below — the 403
// path, the client separation, the ordering — is exercised by `pnpm test`.
//
// NO CORS HEADERS, DELIBERATELY. This is invoked server-to-server from the Next
// service seam, so no preflight occurs. A browser call would fail on CORS, which is
// the safe direction for an admin-only endpoint. Adding browser support would mean
// adding CORS *and* re-reviewing the threat model.
//
// REQUIRED SECRETS (set at deploy time; see docs/adr/0014-arcbase-staff-invitations.md):
//   • SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY — injected
//     automatically by Supabase. Do not set or commit these.
//   • ARCBASE_SITE_URL — must be set manually:
//         supabase secrets set ARCBASE_SITE_URL=https://<your-app-host>

import { createClient } from "jsr:@supabase/supabase-js@2";

type StaffRole = "admin" | "analyst";

const ROLES: readonly StaffRole[] = ["admin", "analyst"];

/** Deliberately conservative: one @, no whitespace, a dot in the domain. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  // ── The caller must present a session. No header, no identity, no decision. ──
  const authorization = req.headers.get("Authorization");
  if (!authorization) return json(401, { error: "Missing Authorization header" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  // ⚠️ THE REDIRECT TARGET IS A SECRET, NOT AN INPUT.
  //
  // It is read from the environment and never from the request body. A
  // caller-supplied `redirectTo` would be an open redirect with an emailed link:
  // whoever called this could have Supabase send a genuine, correctly-signed
  // invitation pointing at a host they control, and harvest the credential
  // exchange. There is deliberately no code path by which the body can influence
  // this value.
  const siteUrl = Deno.env.get("ARCBASE_SITE_URL");

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !siteUrl) {
    // Fail closed and say which piece is missing — but only in the log, never in
    // the response body, which reaches a browser.
    console.error("invite-staff misconfigured", {
      supabaseUrl: Boolean(supabaseUrl),
      anonKey: Boolean(anonKey),
      serviceRoleKey: Boolean(serviceRoleKey),
      arcbaseSiteUrl: Boolean(siteUrl),
    });
    return json(500, { error: "Function is not configured" });
  }

  // ══ 1. AUTHORISATION — decided from the CALLER's JWT, and nothing else. ══════
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });

  const { data: callerIsAdmin, error: adminError } = await caller.rpc("is_admin");
  if (adminError) {
    console.error("is_admin() failed", adminError.message);
    return json(500, { error: "Could not verify caller" });
  }
  // Strict `!== true`: a null or undefined answer is NOT an admin.
  if (callerIsAdmin !== true) {
    return json(403, { error: "admin role required" });
  }

  // ══ 2. VALIDATION — before the privileged client exists. ═════════════════════
  let body: { email?: unknown; role?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Body must be JSON" });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = body.role;

  if (!EMAIL.test(email)) return json(400, { error: "A valid email address is required" });
  if (typeof role !== "string" || !ROLES.includes(role as StaffRole)) {
    return json(400, { error: "Role must be admin or analyst" });
  }

  // ══ 3. EXECUTION — the service-role client, created only now. ════════════════
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const redirectTo = `${siteUrl.replace(/\/+$/, "")}/auth/callback?next=/auth/update-password`;

  // ⚠️ INVITE FIRST, THEN THE ROLE. `staff_roles.user_id` REFERENCES
  // `auth.users(id)`, so a role written before the account exists violates the
  // foreign key. The invite returns the new id; that is what the insert uses.
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
  });

  if (inviteError || !invited?.user) {
    console.error("inviteUserByEmail failed", inviteError?.message);
    return json(400, { error: inviteError?.message ?? "Could not send the invitation" });
  }

  const userId = invited.user.id;

  // ⚠️ A DIRECT INSERT, NOT `set_staff_role`. That function is guarded on
  // `auth.uid()`, which is null for the service-role client, so calling it here
  // would raise 42501. Bypassing it is safe in this ONE direction: inviting can
  // only ADD a role row for a brand-new account, so the last-admin invariant that
  // `set_staff_role` protects cannot be threatened by it.
  const { error: roleError } = await admin.from("staff_roles").insert({
    user_id: userId,
    role,
  });

  if (roleError) {
    // ⚠️ PARTIAL SUCCESS IS ITS OWN OUTCOME — NOT SUCCESS, NOT FAILURE.
    //
    // The invitation is already sent and the account already exists; it cannot be
    // un-sent. What failed is only the role row, and its absence means the account
    // defaults to `analyst` (ADR 0013) — the least-privileged direction, and
    // recoverable from the same screen by assigning the role again. Reporting
    // blanket success here would leave an admin believing they had created an
    // admin when they had not.
    console.error("staff_roles insert failed", roleError.message);
    return json(200, {
      status: "invited_without_role",
      userId,
      message:
        `Invitation sent to ${email}, but their role could not be saved. ` +
        `They will join as a Data Analyst — set their role from this screen once they appear.`,
    });
  }

  return json(200, { status: "invited", userId });
});
