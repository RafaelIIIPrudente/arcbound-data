"use client";

import * as React from "react";

import { ingestMetricsAction } from "@/app/(app)/upload/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { SourceType } from "@/services/types";

import { FormatReview } from "./format-review";
import { ResultSummary } from "./result-summary";

const EXPECTED_COLUMNS =
  "linkedin_post_id, urn, post_url, analytics_url, post_name, post_content, post_date, impressions, likes, comments, reposts, engagement_rate, saves, post_format_type, scraped_at";

const JSON_PLACEHOLDER =
  '[ { "linkedin_post_id": "7482826683478081536", "impressions": 385, "likes": 11, "comments": 8, "reposts": 5, "engagement_rate": 6.23, "saves": null, "post_format_type": "", "scraped_at": "2026-07-15T15:25:39.889Z" } ]';

/**
 * Outer wrapper: bumps a key so "Upload another" remounts the flow with a clean
 * `useActionState` and empty fields.
 *
 * ⚠️ THE CLIENT IS A PROP NOW, AND THAT IS WHAT MAKES A RESET KEEP IT (D12).
 * `key={attempt}` deliberately throws away every piece of state INSIDE the flow;
 * when the Client lived in here it was thrown away too, so uploading twice for the
 * same person meant re-picking them each time. Owned above (by `IngestPanel`) it
 * survives the remount — and the common case, two services for one person
 * back-to-back, stops costing a re-selection.
 */
export function UploadForm({ clientId }: { clientId: string }) {
  const [attempt, setAttempt] = React.useState(0);
  return <IngestFlow key={attempt} clientId={clientId} onReset={() => setAttempt((a) => a + 1)} />;
}

function IngestFlow({ clientId, onReset }: { clientId: string; onReset: () => void }) {
  const [state, formAction, pending] = React.useActionState(ingestMetricsAction, null);

  const [sourceType, setSourceType] = React.useState<SourceType>("csv");
  const [csvText, setCsvText] = React.useState("");
  const [csvFileName, setCsvFileName] = React.useState("");
  const [jsonText, setJsonText] = React.useState("");
  const [follower, setFollower] = React.useState("");
  // ⚠️ SEPARATE STATE, AND IT STAYS A STRING. Empty means "not captured on this
  // scrape" and must travel to the action as an empty string, not as 0 — the
  // action is the one place that decides what blank means.
  const [connections, setConnections] = React.useState("");

  const errors = state?.status === "error" ? state.errors : undefined;

  function submit(extra?: { skipReview?: boolean; resolvedFormatTypes?: Record<string, string> }) {
    const formData = new FormData();
    formData.set("clientId", clientId);
    formData.set("sourceType", sourceType);
    formData.set("rawText", sourceType === "csv" ? csvText : jsonText);
    formData.set("followerCount", follower);
    formData.set("connectionsCount", connections);
    if (extra?.skipReview) formData.set("skipReview", "true");
    if (extra?.resolvedFormatTypes) {
      formData.set("resolvedFormatTypes", JSON.stringify(extra.resolvedFormatTypes));
    }
    React.startTransition(() => formAction(formData));
  }

  function readFile(file: File) {
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setCsvText(typeof reader.result === "string" ? reader.result : "");
    reader.readAsText(file);
  }

  if (state?.status === "ok") {
    return <ResultSummary summary={state.summary} warning={state.warning} onReset={onReset} />;
  }

  if (state?.status === "review") {
    return (
      <FormatReview
        posts={state.posts}
        pending={pending}
        onConfirm={(resolvedFormatTypes) => submit({ resolvedFormatTypes })}
        onSkip={() => submit({ skipReview: true })}
      />
    );
  }

  return (
    <div className="max-w-3xl space-y-5">
      {/* ⚠️ STEP 01 IS THE CLIENT, AND IT LIVES IN `IngestPanel` NOW — which is why
          the numbering below still starts at 02 and the staff-facing sequence is
          unchanged. This error is kept rather than dropped with the control: the
          action still validates `clientId`, and a validation result with nowhere
          to render is a failure nobody can see. */}
      <FieldError message={errors?.clientId?.[0]} />

      <Step n="02" title="Choose input">
        <div className="mb-4 inline-flex overflow-hidden rounded-md border">
          <ToggleButton active={sourceType === "csv"} onClick={() => setSourceType("csv")}>
            CSV upload
          </ToggleButton>
          <ToggleButton active={sourceType === "json"} onClick={() => setSourceType("json")}>
            Paste JSON
          </ToggleButton>
        </div>

        {sourceType === "csv" ? (
          <>
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
                aria-label="CSV file"
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
          </>
        ) : (
          <Textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder={JSON_PLACEHOLDER}
            className="min-h-37.5 font-mono text-[12.5px]"
            aria-label="Paste JSON"
          />
        )}
        <FieldError message={errors?.rawText?.[0] ?? errors?.payload?.[0]} />
      </Step>

      <Separator />

      {/* ⚠️ ONE STEP, TWO COUNTS, AND ONLY ONE OF THEM IS REQUIRED. Both are
          audience figures captured with the same scrape, so they belong side by
          side rather than in a separate step. The optional one says so on the
          label: leaving it blank records the scrape with NO connection count,
          which the history shows as a gap — never as zero. */}
      <Step
        n="03"
        title="Follower & connection counts"
        description="Stored with this scrape, at time of capture."
      >
        <div className="flex flex-wrap gap-4">
          <div>
            <Input
              value={follower}
              onChange={(e) => setFollower(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 18420"
              className="w-52 font-mono"
              aria-label="Follower count"
            />
            <p className="mt-1.5 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
              Followers
            </p>
            <FieldError message={errors?.followerCount?.[0]} />
          </div>
          <div>
            <Input
              value={connections}
              onChange={(e) => setConnections(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 4820"
              className="w-52 font-mono"
              aria-label="Connection count"
            />
            <p className="mt-1.5 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
              Connections · optional
            </p>
            <FieldError message={errors?.connectionsCount?.[0]} />
          </div>
        </div>
        <p className="mt-2.5 font-mono text-[10.5px] leading-relaxed text-muted-foreground/80">
          Leave connections blank if you don&rsquo;t have it — the scrape still uploads, and that
          week shows no connection figure rather than a zero.
        </p>
      </Step>

      <Separator />

      <Step n="04" title="Submit">
        <Button onClick={() => submit()} disabled={pending}>
          {pending ? "Uploading…" : "Upload metrics"}
        </Button>
        <p className="mt-2.5 font-mono text-[10.5px] text-muted-foreground">
          Re-uploading the same scrape is safe — duplicates are skipped.
        </p>
      </Step>
    </div>
  );
}

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

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "px-5 py-2 font-mono text-[11.5px] tracking-[0.08em] uppercase transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:-outline-offset-2 focus-visible:outline-none",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-2 font-mono text-[11px] text-primary">{message}</p>;
}
