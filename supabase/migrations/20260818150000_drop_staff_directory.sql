-- ArcBase — drop the orphaned public.list_staff_directory(): the CLI migration copy.
--
-- Twin of supabase/drop-staff-directory.sql; the SQL in the two files is
-- identical and supabase/sql-sync.test.ts fails if they drift. Timestamped after
-- 20260818140000_writers_registry.sql, which orphaned this function.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY THIS **AFTER** THE W2 CODE IS DEPLOYED, NOT WITH THE REGISTRY SWAP.
--
-- This is a THIRD pair rather than three extra lines in writers-registry.sql, and
-- the ordering is the whole reason:
--
--   • writers-registry.sql must be applied BEFORE the new code deploys — the
--     client SELECT carries `writer:writers(id, name)`, which needs the table and
--     the foreign key to exist.
--   • This drop must happen AFTER that deploy — the code being replaced still
--     calls `list_staff_directory()` through `services/staff.ts`, and dropping the
--     function while it is running turns every Client screen into an error.
--
-- Two changes, two different moments. Folding this into the earlier script would
-- create exactly the window D15 warns about: the function gone while its last
-- caller is still live.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ THE FUNCTION IS ORPHANED, NOT DEPRECATED. `clients.ts` used it to turn a
-- `writer_id` into an email because `writer_id` referenced `auth.users`, which
-- `authenticated` cannot read. A writer is now a row in `public.writers` reached
-- by the client select's own embed, so nothing asks for a staff email at all.
--
-- ⚠️ `public.list_staff()` IS UNTOUCHED, AND MUST STAY THAT WAY. It is the
-- admin-only roster carrying role, `assigned` and `pending` — a different RPC
-- with a different audience, and the boundary ADR 0013 draws. Only the
-- two-column directory granted to every authenticated staff member goes.
--
-- Safe to re-run: `if exists`.
drop function if exists public.list_staff_directory();

-- ============================================================================
-- VERIFICATION — ⚠️ run these ONE AT A TIME
-- ============================================================================
--
-- Expect ONE row, `list_staff`, and no `list_staff_directory`.
select proname from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname like 'list_staff%'
 order by proname;
