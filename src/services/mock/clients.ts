import type { Client } from "@/services/types";

// Seed Clients mirroring the design brief's client roster
// (docs/arcbase-dashboard-design-brief). Each `linkedin_url` is already in
// normalized form (https, no www, no trailing slash). Replace when the seam is
// wired to a real backend. Deterministic ids + dates keep tests stable.
export const MOCK_CLIENTS: Client[] = [
  {
    id: "CLIENT-0001",
    name: "Bryan Wish",
    linkedin_url: "https://linkedin.com/in/bryanwish",
    createdAt: "2026-01-04T09:00:00.000Z",
    postsCount: 5,
  },
  {
    id: "CLIENT-0002",
    name: "Senthil Kumar",
    linkedin_url: "https://linkedin.com/in/senthilkumar",
    createdAt: "2026-01-06T11:30:00.000Z",
    postsCount: 62,
  },
  {
    id: "CLIENT-0003",
    name: "Marcus Chen",
    linkedin_url: "https://linkedin.com/in/marcuschen",
    createdAt: "2026-01-08T14:15:00.000Z",
    postsCount: 48,
  },
  {
    id: "CLIENT-0004",
    name: "Priya Nadella",
    linkedin_url: "https://linkedin.com/in/priyanadella",
    createdAt: "2026-01-10T08:45:00.000Z",
    postsCount: 51,
  },
  {
    id: "CLIENT-0005",
    name: "David Okonkwo",
    linkedin_url: "https://linkedin.com/in/davidokonkwo",
    createdAt: "2026-01-12T16:20:00.000Z",
    postsCount: 33,
  },
  {
    id: "CLIENT-0006",
    name: "Elena Rossi",
    linkedin_url: "https://linkedin.com/in/elenarossi",
    createdAt: "2026-01-14T10:05:00.000Z",
    postsCount: 29,
  },
  {
    id: "CLIENT-0007",
    name: "James Whitfield",
    linkedin_url: "https://linkedin.com/in/jameswhitfield",
    createdAt: "2026-01-16T13:40:00.000Z",
    postsCount: 44,
  },
];
