"use client";

import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ErrorStateProps {
  title?: string;
  description?: string;
  /** When provided, renders a "Try again" button wired to this handler. */
  onReset?: () => void;
  /** Opaque support reference (e.g. a Next.js error digest). Never the raw error. */
  digest?: string;
}

/**
 * Friendly, recoverable error UI. Deliberately takes only presentational copy —
 * never a raw error message or stack — so internal details can't leak to users.
 * Theme-aware (shadcn tokens), responsive, and centered.
 */
export function ErrorState({
  title = "Something went wrong",
  description = "An unexpected error occurred. You can try again — if it keeps happening, please contact support.",
  onReset,
  digest,
}: ErrorStateProps) {
  return (
    <div className="flex min-h-[50vh] w-full items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <TriangleAlert className="size-5" aria-hidden="true" />
          </div>
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {onReset ? (
          <CardContent>
            <Button onClick={onReset}>Try again</Button>
          </CardContent>
        ) : null}
        {digest ? (
          <CardFooter className="justify-center">
            <p className="text-xs text-muted-foreground">Reference: {digest}</p>
          </CardFooter>
        ) : null}
      </Card>
    </div>
  );
}
