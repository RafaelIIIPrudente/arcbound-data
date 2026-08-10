"use client";

import * as React from "react";

import { ingestOutreachAction } from "@/app/(app)/upload/outreach-actions";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { OUTREACH_HEADERS } from "@/lib/parse-outreach";

// ─────────────────────────────────────────────────────────────────────────────
// The Outreach snapshot upload — the second tab of Add Data.
//
// ⚠️ DELIBERATELY THINNER THAN THE LINKEDIN WIZARD. That form has four steps
// because a scrape carries a source-type choice, two audience counts and a
// format-review round trip. A snapshot carries none of those: it is one CSV,
// attached to one Client. Mirroring its four steps would have meant inventing
// ceremony — an empty "choose input" toggle with one option, a counts step with
// no counts — so this is three steps in the same visual language.
//
// ⚠️ THE LINKEDIN FORM IS NOT TOUCHED BY THIS FILE, and that is a hard rule: the
// working metrics upload must carry no risk from this feature.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The 24 source columns, as help text.
 *
 * Read from the parser's own constant rather than restated, so the list a
 * staffer checks their export against is the same list the schema validates
 * with. A hand-copied twin here would drift and quietly send people looking for
 * the wrong header.
 */
const EXPECTED_COLUMNS = OUTREACH_HEADERS.join(", ");

/**
 * Outer wrapper: bumps a key so "Upload another" remounts the flow with a clean
 * `useActionState` and empty fields. Same pattern as the LinkedIn form.
 */
export function OutreachUploadForm({ clientId }: { clientId: string }) {
  const [attempt, setAttempt] = React.useState(0);
  return (
    <OutreachFlow key={attempt} clientId={clientId} onReset={() => setAttempt((a) => a + 1)} />
  );
}

function OutreachFlow({ clientId, onReset }: { clientId: string; onReset: () => void }) {
  const [state, formAction, pending] = React.useActionState(ingestOutreachAction, null);

  const [csvText, setCsvText] = React.useState("");
  const [csvFileName, setCsvFileName] = React.useState("");

  const errors = state?.status === "error" ? state.errors : undefined;

  function submit() {
    const formData = new FormData();
    formData.set("clientId", clientId);
    formData.set("rawText", csvText);
    React.startTransition(() => formAction(formData));
  }

  function readFile(file: File) {
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setCsvText(typeof reader.result === "string" ? reader.result : "");
    reader.readAsText(file);
  }

  if (state?.status === "ok") {
    return <SnapshotSummary rowCount={state.rowCount} warning={state.warning} onReset={onReset} />;
  }

  return (
    <div className="max-w-3xl space-y-5">
      {/* ⚠️ STEP 01 IS THE CLIENT, AND IT LIVES IN `IngestPanel` NOW — which is why
          the numbering below still starts at 02 and the staff-facing sequence is
          unchanged. A snapshot still attaches to one client chosen in the UI and
          never read from the file; the choice simply happens one level up, so it
          survives a tab switch and a reset. The error is kept rather than dropped
          with the control: the action still validates `clientId`. */}
      <FieldError message={errors?.clientId?.[0]} />

      <Step n="02" title="Drop the Master Database CSV" description="The whole export, every row.">
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) readFile(file);
          }}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-muted/30 p-8 text-center transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background hover:bg-muted/50"
        >
          <span className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
            Drop CSV or click to browse
          </span>
          <span className="font-mono text-[10.5px] text-muted-foreground/70">
            {csvFileName || "No file selected"}
          </span>
          {/* sr-only (not hidden) so the control stays keyboard-focusable. */}
          <input
            type="file"
            accept=".csv"
            aria-label="Outreach CSV file"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) readFile(file);
            }}
          />
        </label>
        <p className="mt-2.5 font-mono text-[10px] leading-relaxed text-muted-foreground/80">
          Expected columns: <span className="text-muted-foreground">{EXPECTED_COLUMNS}</span>
        </p>
        <FieldError message={errors?.rawText?.[0] ?? errors?.payload?.[0]} />
      </Step>

      <Separator />

      <Step n="03" title="Submit">
        <Button onClick={submit} disabled={pending}>
          {pending ? "Uploading…" : "Upload snapshot"}
        </Button>
        {/* ⚠️ SAYS "STORED AGAIN", NOT "duplicates are skipped". The LinkedIn
            upsert skips duplicates; a snapshot deliberately re-stores every row
            so movement can be computed by comparing uploads (ADR 0012). Copying
            the neighbouring reassurance would have described the opposite
            behaviour. */}
        <p className="mt-2.5 font-mono text-[10.5px] leading-relaxed text-muted-foreground">
          Every upload stores the whole file again as a new snapshot — that is how the funnel is
          compared over time. Nothing is merged, deduplicated, or overwritten.
        </p>
      </Step>
    </div>
  );
}

/**
 * The success panel, in `ResultSummary`'s visual language.
 *
 * ⚠️ NOT `ResultSummary` ITSELF. That component's shape is an `IngestSummary` —
 * inserted / updated / unchanged — which is the vocabulary of an UPSERT. A
 * snapshot has none of those states: every row is stored, every time. Passing it
 * fake zeroes would have printed "0 updated, 0 unchanged" under an outreach
 * upload and invited exactly the wrong mental model.
 */
function SnapshotSummary({
  rowCount,
  warning,
  onReset,
}: {
  rowCount: number;
  warning?: string;
  onReset: () => void;
}) {
  return (
    <div className="max-w-2xl space-y-5">
      <div className="rounded-lg border bg-card p-7">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="size-2.5 rounded-full bg-emerald-500" aria-hidden />
          <span className="font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
            Snapshot stored
          </span>
        </div>
        <div>
          <div className="font-display text-5xl leading-none font-extrabold tracking-tight text-primary tabular-nums">
            {rowCount.toLocaleString()}
          </div>
          <div className="mt-2 font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground uppercase">
            Prospects stored
          </div>
        </div>
      </div>
      {warning && (
        <p
          role="status"
          className="rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
        >
          {warning}
        </p>
      )}
      <div className="flex gap-3">
        <Button onClick={onReset}>Upload another</Button>
      </div>
    </div>
  );
}

/**
 * A numbered step.
 *
 * ⚠️ A DELIBERATE DUPLICATE of the `Step` in `upload-form.tsx`. That one is not
 * exported, and this slice is forbidden from editing that file — the LinkedIn
 * path must render byte-for-byte unchanged. Lifting the shared component into
 * its own module is the right fix and is left for whoever is allowed to touch
 * both files; doing it here would have meant editing the one thing this slice
 * must not.
 */
function Step({
  n,
  title,
  description,
  children,
}: {
  n: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="shrink-0 pt-0.5 font-mono text-[13px] text-primary">{n}</div>
      <div className="flex-1">
        <div className="font-display text-base font-semibold">{title}</div>
        {description && (
          <div className="mt-1 mb-3 text-[12.5px] text-muted-foreground">{description}</div>
        )}
        {children}
      </div>
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-2 font-mono text-[11px] text-primary">{message}</p>;
}
