import Link from "next/link";

import { Button } from "@/components/ui/button";
import { paths } from "@/paths";

/**
 * Shown on the Upload screen when there are no clients yet — metrics attach to a
 * client, so guide the user to register one first.
 */
export function UploadEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border py-20 text-center">
      <div>
        <p className="font-display text-lg font-semibold">Add a client first</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Post metrics attach to a client. Register a client before uploading a scrape.
        </p>
      </div>
      <Button asChild>
        <Link href={paths.clients.list}>Go to Clients</Link>
      </Button>
    </div>
  );
}
