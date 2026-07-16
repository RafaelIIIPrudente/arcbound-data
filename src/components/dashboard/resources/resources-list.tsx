import { ArrowUpRight } from "lucide-react";

import type { Resource } from "@/services/types";

export function ResourcesList({ resources }: { resources: Resource[] }) {
  if (resources.length === 0) {
    return (
      <div className="rounded-lg border py-16 text-center">
        <p className="text-sm text-muted-foreground">No resources yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      {resources.map((resource) => (
        <a
          key={resource.id}
          href={resource.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 border-t px-5 py-4 transition-colors first:border-t-0 hover:bg-muted/50"
        >
          <span className="flex-1 font-display text-[15px] font-medium">{resource.title}</span>
          <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </a>
      ))}
    </div>
  );
}
