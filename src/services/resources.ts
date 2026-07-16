import type { Resource } from "@/services/types";
import { MOCK_RESOURCES } from "@/services/mock/resources";

// ─────────────────────────────────────────────────────────────────────────────
// Service Seam for Resources. Screens and Server Actions call these functions
// and never touch a data source directly. To go live, swap the bodies for
// Supabase queries — the signatures stay identical. See
// docs/adr/0003-mock-first-service-seam.md.
//
// Resources are view + add only and IMMUTABLE (SRS OI-05): there is deliberately
// no update or delete function here.
// ─────────────────────────────────────────────────────────────────────────────

// In-memory store seeded from the mock data (cloned so the seed is not mutated).
let store: Resource[] = MOCK_RESOURCES.map((resource) => ({ ...resource }));

function nextId(): string {
  // Deterministic id (no Date.now/random) so tests are stable.
  return `RES-${String(store.length + 1).padStart(4, "0")}`;
}

export async function listResources(): Promise<Resource[]> {
  return store;
}

export async function createResource(input: { title: string; url: string }): Promise<Resource> {
  const resource: Resource = {
    id: nextId(),
    title: input.title.trim(),
    url: input.url.trim(),
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  store = [resource, ...store];
  return resource;
}
