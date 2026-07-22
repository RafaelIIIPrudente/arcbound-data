import type { Resource } from "@/services/types";

// Seed team resources mirroring the design brief's roster
// (docs/arcbase-dashboard-design-brief). Replace when the seam is wired to a
// real backend. Deterministic ids + dates keep tests stable.
export const MOCK_RESOURCES: Resource[] = [
  {
    id: "RES-0001",
    title: "LinkedIn scrape bookmarklet — setup & VPN",
    url: "https://www.notion.so/arcbound/scrape-bookmarklet-setup",
    createdAt: "2026-01-04T09:00:00.000Z",
  },
  {
    id: "RES-0002",
    title:
      "Post format taxonomy (Image / Document / Video / Text / Poll / Article / Slide show / Share / Instant share / Unknown)",
    url: "https://www.notion.so/arcbound/post-format-taxonomy",
    createdAt: "2026-01-06T11:30:00.000Z",
  },
  {
    id: "RES-0003",
    title: "Weekly ingestion checklist",
    url: "https://www.notion.so/arcbound/weekly-ingestion-checklist",
    createdAt: "2026-01-08T14:15:00.000Z",
  },
];
