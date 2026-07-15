import type { Metadata } from "next";

import { Placeholder } from "@/components/dashboard/placeholder";

export const metadata: Metadata = { title: "Add LI post metrics" };

export default function UploadPage() {
  return (
    <Placeholder
      label="Ingestion"
      note="The CSV/JSON metrics upload flow arrives in a later slice."
    />
  );
}
