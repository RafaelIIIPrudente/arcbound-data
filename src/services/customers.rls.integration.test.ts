import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * RLS tenant-isolation integration test — multi-tenancy T1.
 *
 * Proves the isolation invariant from ADR 0005 and the spec: Postgres RLS, not
 * app code, is the tenant boundary. It exercises the real RLS-enforced path that
 * the org-scoped Customers service will sit on in a later pass (T4), so its core
 * assertions are NEGATIVE — a member of one Organization can neither read nor
 * write another's Customers, and a `member` cannot perform an admin-gated write.
 *
 * Runs ONLY when a local Supabase is configured; otherwise it SKIPS cleanly so
 * the default `pnpm test` stays green without Docker. To run it:
 *
 *   supabase start            # prints the local URL + anon/service_role keys
 *   SUPABASE_TEST_URL=http://127.0.0.1:54321 \
 *   SUPABASE_TEST_ANON_KEY=<local anon key> \
 *   SUPABASE_TEST_SERVICE_ROLE_KEY=<local service_role key> \
 *   pnpm test customers.rls
 */

const url = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const hasLocalSupabase = Boolean(url && anonKey && serviceKey);

// describe.skip when unconfigured. All client creation lives in beforeAll (which
// never runs while skipped), so a missing env never throws during collection.
const describeIntegration = hasLocalSupabase ? describe : describe.skip;

describeIntegration("customers RLS tenant isolation", () => {
  const password = "test-Password-123!";
  const suffix = crypto.randomUUID().slice(0, 8);
  const emailA = `owner-a-${suffix}@example.test`;
  const emailB = `owner-b-${suffix}@example.test`;
  const emailC = `member-c-${suffix}@example.test`;

  let admin: SupabaseClient;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let clientC: SupabaseClient;
  let userAId: string;
  let userBId: string;
  let userCId: string;
  let orgAId: string;
  let orgBId: string;

  async function createUser(email: string): Promise<string> {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    if (!data.user) throw new Error(`no user returned for ${email}`);
    return data.user.id;
  }

  async function signIn(email: string): Promise<SupabaseClient> {
    const client = createClient(url!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return client;
  }

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    userAId = await createUser(emailA);
    userBId = await createUser(emailB);
    userCId = await createUser(emailC);

    clientA = await signIn(emailA);
    clientB = await signIn(emailB);
    clientC = await signIn(emailC);

    // Each owner bootstraps their own Organization via the SECURITY DEFINER RPC.
    const { data: orgA, error: orgAErr } = await clientA.rpc("create_organization", {
      p_name: "Org A",
    });
    if (orgAErr) throw orgAErr;
    orgAId = orgA.id;

    const { data: orgB, error: orgBErr } = await clientB.rpc("create_organization", {
      p_name: "Org B",
    });
    if (orgBErr) throw orgBErr;
    orgBId = orgB.id;

    // A (owner) adds C as a plain member of Org A.
    const { error: memErr } = await clientA.from("memberships").insert({
      organization_id: orgAId,
      user_id: userCId,
      role: "member",
    });
    if (memErr) throw memErr;

    // Seed one customer in each org (as the owner, an allowed write).
    const { error: seedAErr } = await clientA.from("customers").insert({
      organization_id: orgAId,
      name: "A Customer",
      email: "a-customer@example.test",
      company: "A Co",
      status: "active",
    });
    if (seedAErr) throw seedAErr;

    const { error: seedBErr } = await clientB.from("customers").insert({
      organization_id: orgBId,
      name: "B Customer",
      email: "b-customer@example.test",
      company: "B Co",
      status: "active",
    });
    if (seedBErr) throw seedBErr;
  }, 30000);

  afterAll(async () => {
    // service_role bypasses RLS; deleting the orgs cascades their customers and
    // memberships, then remove the auth users.
    if (orgAId) await admin.from("organizations").delete().eq("id", orgAId);
    if (orgBId) await admin.from("organizations").delete().eq("id", orgBId);
    for (const id of [userAId, userBId, userCId]) {
      if (id) await admin.auth.admin.deleteUser(id);
    }
  });

  it("owner reads only their own Organization's customers", async () => {
    const { data, error } = await clientA.from("customers").select("organization_id");
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBeGreaterThan(0);
    expect((data ?? []).every((row) => row.organization_id === orgAId)).toBe(true);
  });

  it("a member of Org A cannot read Org B's customers (RLS returns zero rows)", async () => {
    const { data, error } = await clientA
      .from("customers")
      .select("*")
      .eq("organization_id", orgBId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("a user cannot insert a customer into an Organization they don't belong to", async () => {
    const { error } = await clientA
      .from("customers")
      .insert({
        organization_id: orgBId,
        name: "Cross-tenant",
        email: "x@example.test",
        company: "X Co",
        status: "active",
      })
      .select();
    expect(error).not.toBeNull();
  });

  it("a member CAN read their Organization's customers", async () => {
    const { data, error } = await clientC
      .from("customers")
      .select("*")
      .eq("organization_id", orgAId);
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBeGreaterThan(0);
  });

  it("a member CANNOT perform an admin-gated customer write", async () => {
    const { error } = await clientC
      .from("customers")
      .insert({
        organization_id: orgAId,
        name: "Member write",
        email: "member-write@example.test",
        company: "A Co",
        status: "active",
      })
      .select();
    expect(error).not.toBeNull();
  });
});
