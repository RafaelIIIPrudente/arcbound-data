"use client";

import * as React from "react";

import { ingestMetricsAction } from "@/app/(app)/upload/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { SourceType } from "@/services/types";

import { FormatReview } from "./format-review";
import { ResultSummary } from "./result-summary";

type ClientOption = { id: string; name: string };

const EXPECTED_COLUMNS =
  "linkedin_post_id, urn, post_url, analytics_url, post_name, post_content, post_date, impressions, likes, comments, reposts, engagement_rate, saves, post_format_type, scraped_at";

const JSON_PLACEHOLDER =
  '[ { "linkedin_post_id": "7482826683478081536", "impressions": 385, "likes": 11, "comments": 8, "reposts": 5, "engagement_rate": 6.23, "saves": null, "post_format_type": "", "scraped_at": "2026-07-15T15:25:39.889Z" } ]';

/**
 * Outer wrapper: bumps a key so "Upload another" remounts the flow with a clean
 * `useActionState` and empty fields.
 */
export function UploadForm({ clients }: { clients: ClientOption[] }) {
  const [attempt, setAttempt] = React.useState(0);
  return <IngestFlow key={attempt} clients={clients} onReset={() => setAttempt((a) => a + 1)} />;
}

function IngestFlow({ clients, onReset }: { clients: ClientOption[]; onReset: () => void }) {
  const [state, formAction, pending] = React.useActionState(ingestMetricsAction, null);

  const [clientId, setClientId] = React.useState("");
  const [sourceType, setSourceType] = React.useState<SourceType>("csv");
  const [csvText, setCsvText] = React.useState("");
  const [csvFileName, setCsvFileName] = React.useState("");
  const [jsonText, setJsonText] = React.useState("");
  const [follower, setFollower] = React.useState("");

  const errors = state?.status === "error" ? state.errors : undefined;

  function submit(extra?: { skipReview?: boolean; resolvedFormatTypes?: Record<string, string> }) {
    const formData = new FormData();
    formData.set("clientId", clientId);
    formData.set("sourceType", sourceType);
    formData.set("rawText", sourceType === "csv" ? csvText : jsonText);
    formData.set("followerCount", follower);
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
    return <ResultSummary summary={state.summary} onReset={onReset} />;
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
      <Step n="01" title="Select client" description="Metrics attach to one client per scrape.">
        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger className="max-w-sm" aria-label="Select client">
            <SelectValue placeholder="Choose a client…" />
          </SelectTrigger>
          <SelectContent>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError message={errors?.clientId?.[0]} />
      </Step>

      <Separator />

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

      <Step
        n="03"
        title="Follower count"
        description="Stored with this scrape, at time of capture."
      >
        <Input
          value={follower}
          onChange={(e) => setFollower(e.target.value)}
          inputMode="numeric"
          placeholder="e.g. 18420"
          className="w-52 font-mono"
          aria-label="Follower count"
        />
        <FieldError message={errors?.followerCount?.[0]} />
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
