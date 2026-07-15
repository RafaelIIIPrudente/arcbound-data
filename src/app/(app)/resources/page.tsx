import type { Metadata } from "next";

import { Placeholder } from "@/components/dashboard/placeholder";

export const metadata: Metadata = { title: "Resources" };

export default function ResourcesPage() {
  return (
    <Placeholder
      label="Team resources"
      note="The resources list and the Add-Resource flow arrive in a later slice."
    />
  );
}
