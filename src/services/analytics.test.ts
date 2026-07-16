import { describe, expect, it } from "vitest";

import { createClient, listClients } from "./clients";
import { getDashboardAnalytics } from "./analytics";

describe("dashboard analytics service", () => {
  it("returns the comp values for the default all-clients 30-day view", async () => {
    const a = await getDashboardAnalytics({ range: "30d" });
    expect(a.hero).toMatchObject({
      label: "Impressions",
      value: 248930,
      delta: 15,
      direction: "up",
    });
    expect(a.totalPosts).toBe(267);
    expect(a.lastSync).toBe("2026-07-14 09:12");
    expect(a.recentPosts.length).toBeGreaterThan(0);
    expect(a.kpis.map((k) => k.label)).toEqual(["Likes", "Comments", "Reposts", "Saves"]);
  });

  it("changes totals and series when the range changes", async () => {
    const short = await getDashboardAnalytics({ range: "7d" });
    const long = await getDashboardAnalytics({ range: "90d" });

    expect(short.hero.value).toBeLessThan(long.hero.value);
    expect(short.totalPosts).toBeLessThan(long.totalPosts);
    expect(short.impressionsSeries).not.toEqual(long.impressionsSeries);
    expect(short.impressionsSeries.length).toBe(7); // 7 daily points
  });

  it("derives delta direction from the sign of the change", async () => {
    const a = await getDashboardAnalytics({ range: "30d" });
    expect(a.hero.direction).toBe("up");

    const reposts = a.kpis.find((k) => k.label === "Reposts");
    expect(reposts).toBeDefined();
    expect(reposts!.direction).toBe("down");
    expect(reposts!.delta).toBe(4); // magnitude, sign stripped
  });

  it("narrows the numbers when a specific client is selected", async () => {
    const { items } = await listClients({ pageSize: 100 });
    const seeded = items.find((c) => c.postsCount > 0);
    expect(seeded).toBeDefined();

    const all = await getDashboardAnalytics({ range: "30d" });
    const one = await getDashboardAnalytics({ range: "30d", clientId: seeded!.id });

    expect(one.hero.value).toBeGreaterThan(0);
    expect(one.hero.value).toBeLessThan(all.hero.value);
    expect(one.recentPosts.length).toBeGreaterThan(0);
  });

  it("returns an empty analytics for a client with no posts (empty state)", async () => {
    const created = await createClient({
      name: "Zero Posts",
      linkedin_url: "https://linkedin.com/in/zeroposts",
    });

    const a = await getDashboardAnalytics({ range: "30d", clientId: created.id });
    expect(a.recentPosts).toEqual([]);
    expect(a.totalPosts).toBe(0);
    expect(a.hero.value).toBe(0);
  });
});
