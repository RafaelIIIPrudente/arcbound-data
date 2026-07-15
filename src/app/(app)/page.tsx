import type { Metadata } from "next";

import { Placeholder } from "@/components/dashboard/placeholder";

export const metadata: Metadata = { title: "Post analytics" };

export default function DashboardPage() {
  return (
    <Placeholder
      label="Overview"
      note="Post analytics — impression trends, engagement, and recent posts — arrive in a later slice."
    />
  );
}
