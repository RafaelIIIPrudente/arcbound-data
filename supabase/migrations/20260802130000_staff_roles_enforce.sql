-- ArcBase Staff Roles ENFORCEMENT — CLI migration twin of
-- supabase/staff-roles-enforce.sql. Held to the SAME executable SQL by
-- supabase/sql-sync.test.ts (headers may differ, statements may not).
--
-- Runs AFTER 20260802120000_staff_roles.sql, which creates public.is_admin() and
-- seeds the admin row this depends on. Narrows the INSERT policy on public.clients
-- so that only an Admin may register a Client (ADR 0013). The SELECT policy is
-- untouched — a Data Analyst still reads everything.
--
-- ⚠️ `alter policy`, not `create policy`: public.clients was created outside this
-- repo and its policy names contain spaces, so they must be double-quoted.
-- Unquoted, Postgres folds and splits the identifier and the statement fails.

-- ============================================================================
-- Registering a Client becomes admin-only
-- ============================================================================
--
-- INSERT is the whole governance surface on this table: ArcBase never updates or
-- deletes a Client (records are immutable, ADR 0007), so there are no other write
-- policies to narrow. A Client is the identity every downstream row attributes to
-- — a wrong or duplicated one splits a person's history with no merge tool — which
-- is why creating one is an Admin act while reading is not.
--
-- The RLS boundary and the Server Action guard are BOTH required and neither
-- replaces the other: this policy is what stops a caller who bypasses the app and
-- uses their own Supabase token, and `requireAdmin()` is what gives a staff member
-- in the UI a redirect instead of a raw Postgres error.
alter policy "arcbase add clients" on public.clients
  with check (public.is_admin());

-- ⚠️ "arcbase read clients" (SELECT, qual = true) IS DELIBERATELY NOT TOUCHED.
--
-- A Data Analyst still reads EVERYTHING. This slice removes the ability to change
-- things, never the ability to see them (ADR 0013 — a privilege tier, not a
-- visibility tier). Narrowing the read policy would break every analyst screen and
-- would be a different, much larger decision than the one that was made.
