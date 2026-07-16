import { describe, expect, it } from "vitest";

import { createClient, DuplicateClientError, getClient, listClients } from "./clients";

describe("clients service", () => {
  it("lists the seeded clients and filters by query", async () => {
    const all = await listClients();
    expect(all.total).toBeGreaterThan(0);

    const first = all.items[0];
    expect(first).toBeDefined();

    const filtered = await listClients({ q: first!.name.slice(0, 3) });
    expect(filtered.items.length).toBeGreaterThan(0);
  });

  it("gets a client by id and creates one with a normalized url", async () => {
    const created = await createClient({
      name: "Nadia Vega",
      linkedin_url: "https://www.linkedin.com/in/nadiavega/",
    });
    expect(created.id).toBeTruthy();
    // The stored url is normalized (www + trailing slash removed).
    expect(created.linkedin_url).toBe("https://linkedin.com/in/nadiavega");
    expect(created.postsCount).toBe(0);

    const fetched = await getClient(created.id);
    expect(fetched).toMatchObject({ name: "Nadia Vega" });
  });

  it("returns null for an unknown id", async () => {
    expect(await getClient("does-not-exist")).toBeNull();
  });

  it("rejects a URL that normalizes to an existing client as a duplicate", async () => {
    await createClient({ name: "Owen Park", linkedin_url: "https://linkedin.com/in/owenpark" });

    // A differently-written URL for the same profile must be rejected.
    await expect(
      createClient({
        name: "Owen Park (dupe)",
        linkedin_url: "http://www.linkedin.com/in/owenpark/",
      }),
    ).rejects.toBeInstanceOf(DuplicateClientError);
  });

  it("rejects a case-variant handle as a duplicate", async () => {
    await createClient({ name: "Case One", linkedin_url: "https://linkedin.com/in/caseyquinn" });

    // LinkedIn handles are case-insensitive, so this is the same profile.
    await expect(
      createClient({ name: "Case Two", linkedin_url: "https://linkedin.com/in/CaseyQuinn" }),
    ).rejects.toBeInstanceOf(DuplicateClientError);
  });

  it("allows two clients with distinct normalized urls", async () => {
    const a = await createClient({
      name: "Distinct One",
      linkedin_url: "https://linkedin.com/in/distinct-one",
    });
    const b = await createClient({
      name: "Distinct Two",
      linkedin_url: "https://linkedin.com/in/distinct-two",
    });
    expect(a.id).not.toBe(b.id);
    expect(a.linkedin_url).not.toBe(b.linkedin_url);
  });
});
