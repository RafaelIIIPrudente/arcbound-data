import { describe, expect, it } from "vitest";

import { createResource, listResources } from "./resources";

describe("resources service", () => {
  it("lists the seeded resources", async () => {
    const all = await listResources();
    expect(all.length).toBeGreaterThan(0);

    const first = all[0];
    expect(first).toBeDefined();
    expect(first!.title).toBeTruthy();
    expect(first!.url).toMatch(/^https?:\/\//);
  });

  it("creates a resource and lists it newest-first", async () => {
    const before = await listResources();
    const created = await createResource({
      title: "New Playbook",
      url: "https://example.com/playbook",
    });
    expect(created.id).toBeTruthy();

    const after = await listResources();
    expect(after.length).toBe(before.length + 1);
    expect(after[0]).toMatchObject({ title: "New Playbook", url: "https://example.com/playbook" });
  });
});
