import { MOCK_CUSTOMERS } from "@/services/mock/customers";
import type { Customer, Paginated } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Service Seam. Screens and Server Actions call these functions and never touch
// a data source directly. To go live, swap the bodies for Supabase queries
// (e.g. `supabase.from("customers").select()`) — the signatures stay identical.
// See docs/adr/0003-mock-first-service-seam.md.
// ─────────────────────────────────────────────────────────────────────────────

// In-memory store seeded from the mock data (cloned so the seed is not mutated).
let store: Customer[] = MOCK_CUSTOMERS.map((customer) => ({ ...customer }));

function nextId(): string {
  // Deterministic id (no Date.now/random) so tests are stable.
  return `CUST-${String(store.length + 1).padStart(4, "0")}`;
}

export interface ListCustomersOptions {
  q?: string;
  page?: number;
  pageSize?: number;
}

export async function listCustomers(opts: ListCustomersOptions = {}): Promise<Paginated<Customer>> {
  const { q, page = 1, pageSize = 10 } = opts;

  let rows = store;
  if (q && q.trim()) {
    const needle = q.trim().toLowerCase();
    rows = rows.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        c.email.toLowerCase().includes(needle) ||
        c.company.toLowerCase().includes(needle),
    );
  }

  const total = rows.length;
  const start = (page - 1) * pageSize;
  return { items: rows.slice(start, start + pageSize), total };
}

export async function getCustomer(id: string): Promise<Customer | null> {
  return store.find((c) => c.id === id) ?? null;
}

export async function createCustomer(input: Omit<Customer, "id" | "createdAt">): Promise<Customer> {
  const customer: Customer = {
    ...input,
    id: nextId(),
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  store = [customer, ...store];
  return customer;
}

export async function updateCustomer(
  id: string,
  patch: Partial<Omit<Customer, "id" | "createdAt">>,
): Promise<Customer> {
  const existing = store.find((c) => c.id === id);
  if (!existing) {
    throw new Error(`Customer ${id} not found`);
  }
  const updated: Customer = { ...existing, ...patch };
  store = store.map((c) => (c.id === id ? updated : c));
  return updated;
}

export async function deleteCustomer(id: string): Promise<void> {
  store = store.filter((c) => c.id !== id);
}
