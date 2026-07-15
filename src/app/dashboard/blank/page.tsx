import type { Metadata } from "next";

export const metadata: Metadata = { title: "Blank" };

// Copy this file to start a new page. Read data through `src/services/*`.
export default function BlankPage() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Blank page</h1>
      <p className="text-sm text-muted-foreground">
        A starting point. Copy this file, then read data through{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">src/services</code>.
      </p>
    </div>
  );
}
