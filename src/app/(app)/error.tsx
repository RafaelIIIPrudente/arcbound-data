"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/error-state";

// Catches errors inside the dashboard. The dashboard layout is the parent, so
// this renders in the content area with the shell (sidebar/top bar) intact — an
// in-shell error, not a full-page blowout.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      title="This page hit a snag"
      description="Something went wrong loading this part of your dashboard. Try again — if it persists, contact support."
      onReset={reset}
      digest={error.digest}
    />
  );
}
