import type { Metadata } from "next";

import { Placeholder } from "@/components/dashboard/placeholder";

export const metadata: Metadata = { title: "Client detail" };

// Placeholder detail route. The Client List nav item stays active here (see
// isNavItemActive). Real KPIs + upload history arrive in a later slice.
export default function ClientDetailPage() {
  return (
    <Placeholder
      label="Client"
      note="Client detail — upload/post/follower KPIs and upload history — arrives in a later slice."
    />
  );
}
