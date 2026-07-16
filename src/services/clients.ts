import { normalizeLinkedInUrl } from "@/lib/linkedin-url";
import type { Client, Paginated } from "@/services/types";
import { MOCK_CLIENTS } from "@/services/mock/clients";

// ─────────────────────────────────────────────────────────────────────────────
// Service Seam for Clients. Screens and Server Actions call these functions and
// never touch a data source directly. To go live, swap the bodies for Supabase
// queries — the signatures stay identical. See
// docs/adr/0003-mock-first-service-seam.md.
//
// Clients are IMMUTABLE (ADR 0007, invariant #2): there is deliberately no
// update or delete function here.
// ─────────────────────────────────────────────────────────────────────────────

/** Thrown when a create would collide with an existing normalized LinkedIn URL. */
export class DuplicateClientError extends Error {
  constructor(public readonly linkedinUrl: string) {
    super("A client with this LinkedIn profile already exists.");
    this.name = "DuplicateClientError";
  }
}

/** Thrown when a create is given a URL that is not a valid LinkedIn profile URL. */
export class InvalidLinkedInUrlError extends Error {
  constructor() {
    super("Enter a valid LinkedIn profile URL.");
    this.name = "InvalidLinkedInUrlError";
  }
}

// In-memory store seeded from the mock data (cloned so the seed is not mutated).
let store: Client[] = MOCK_CLIENTS.map((client) => ({ ...client }));

function nextId(): string {
  // Deterministic id (no Date.now/random) so tests are stable.
  return `CLIENT-${String(store.length + 1).padStart(4, "0")}`;
}

export interface ListClientsOptions {
  q?: string;
  page?: number;
  pageSize?: number;
}

export async function listClients(opts: ListClientsOptions = {}): Promise<Paginated<Client>> {
  const { q, page = 1, pageSize = 10 } = opts;

  let rows = store;
  if (q && q.trim()) {
    const needle = q.trim().toLowerCase();
    rows = rows.filter(
      (c) => c.name.toLowerCase().includes(needle) || c.linkedin_url.toLowerCase().includes(needle),
    );
  }

  const total = rows.length;
  const start = (page - 1) * pageSize;
  return { items: rows.slice(start, start + pageSize), total };
}

export async function getClient(id: string): Promise<Client | null> {
  return store.find((c) => c.id === id) ?? null;
}

export async function createClient(input: { name: string; linkedin_url: string }): Promise<Client> {
  const normalized = normalizeLinkedInUrl(input.linkedin_url);
  if (!normalized.ok) {
    throw new InvalidLinkedInUrlError();
  }
  // Identity is the normalized URL — dup-check on it (ArcBase v1 spec, OI-01).
  if (store.some((c) => c.linkedin_url === normalized.value)) {
    throw new DuplicateClientError(normalized.value);
  }

  const client: Client = {
    id: nextId(),
    name: input.name.trim(),
    linkedin_url: normalized.value,
    createdAt: "2026-01-01T00:00:00.000Z",
    postsCount: 0,
  };
  store = [client, ...store];
  return client;
}
