"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ReviewPost } from "@/services/types";

const FORMATS = ["image", "carousel", "link", "text", "video"] as const;

export function FormatReview({
  posts,
  pending,
  onConfirm,
  onSkip,
}: {
  posts: ReviewPost[];
  pending: boolean;
  onConfirm: (resolved: Record<string, string>) => void;
  onSkip: () => void;
}) {
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const allChosen = posts.every((post) => resolved[post.linkedin_post_id]);

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-lg border bg-card p-6">
        <h2 className="font-display text-lg font-bold tracking-tight">Review post formats</h2>
        <p className="mt-1 mb-5 text-sm text-muted-foreground">
          {posts.length} new {posts.length === 1 ? "post" : "posts"} arrived without a confident
          format type. Set them, or trust the scraper and skip.
        </p>
        {posts.map((post) => (
          <div
            key={post.linkedin_post_id}
            className="flex items-center gap-4 border-t py-3 first:border-t-0"
          >
            <div className="min-w-0 flex-1 truncate text-sm">{post.snippet}</div>
            <Select
              value={resolved[post.linkedin_post_id] ?? ""}
              onValueChange={(value) =>
                setResolved((prev) => ({ ...prev, [post.linkedin_post_id]: value }))
              }
            >
              <SelectTrigger className="w-36 font-mono text-[11.5px]" aria-label="Post format">
                <SelectValue placeholder="— select —" />
              </SelectTrigger>
              <SelectContent>
                {FORMATS.map((format) => (
                  <SelectItem key={format} value={format}>
                    {format}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        <Button disabled={pending || !allChosen} onClick={() => onConfirm(resolved)}>
          Confirm &amp; write
        </Button>
        <Button variant="outline" disabled={pending} onClick={onSkip}>
          Trust scraper &amp; skip
        </Button>
      </div>
    </div>
  );
}
