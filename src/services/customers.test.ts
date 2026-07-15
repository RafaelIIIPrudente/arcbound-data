import { describe, expect, it } from "vitest";

import { createCustomer, getCustomer, listCustomers } from "./customers";

describe("customers service", () => {
  it("lists and filters by query", async () => {
    const all = await listCustomers();
    expect(all.total).toBeGreaterThan(0);

    const first = all.items[0];
    expect(first).toBeDefined();

    const filtered = await listCustomers({ q: first!.name.slice(0, 3) });
    expect(filtered.items.length).toBeGreaterThan(0);
  });

  it("gets by id and creates", async () => {
    const created = await createCustomer({
      name: "Ida Nova",
      email: "ida@example.io",
      company: "Newco",
      status: "active",
    });
    expect(created.id).toBeTruthy();

    const fetched = await getCustomer(created.id);
    expect(fetched).toMatchObject({ name: "Ida Nova" });
  });

  it("returns null for an unknown id", async () => {
    expect(await getCustomer("does-not-exist")).toBeNull();
  });
});
