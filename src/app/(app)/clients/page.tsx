import type { Metadata } from "next";

import { Placeholder } from "@/components/dashboard/placeholder";

export const metadata: Metadata = { title: "Client list" };

export default function ClientsPage() {
  return (
    <Placeholder
      label="Clients"
      note="The client list and the Add-Client flow arrive in a later slice."
    />
  );
}
