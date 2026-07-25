"use client";

import { useActionState, useState } from "react";
import { Check, Copy, KeyRound, Link2, Plus, RotateCcw } from "lucide-react";

import {
  createReportLinkAction,
  revokeReportLinkAction,
  rotateReportLinkAction,
  type ReportLinkActionState,
} from "@/app/(app)/clients/[id]/report-link-actions";
import { Button } from "@/components/ui/button";
import type { IssuedReportLink, ReportLinkStatus } from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// Staff "Report Link" card on the client detail page: Create / Rotate / Revoke a
// Client's single public Report Link, copy its URL, and see the Access Code ONCE.
//
// ⚠️ THE ACCESS CODE IS ONE-TIME. It exists only in the transient action result
// (`issued`), never in `ReportLinkStatus` (which carries no code by construction).
// A plain render of an active link therefore CANNOT show it — the tests assert
// this. The code panel renders solely when `issued` is present (right after a
// Create/Rotate), with a "copy it now — it won't be shown again" affordance.
// ─────────────────────────────────────────────────────────────────────────────

const IDLE: ReportLinkActionState = { status: "idle" };

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={`Copy ${label}`}
      onClick={() => {
        void navigator.clipboard?.writeText?.(value);
        setCopied(true);
      }}
    >
      {copied ? (
        <Check className="size-3.5" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
      Copy
    </Button>
  );
}

/** The one-time Access Code panel — shown ONCE, right after Create/Rotate. */
function IssuedAccessCode({ link }: { link: IssuedReportLink }) {
  return (
    <div
      data-testid="access-code-panel"
      className="space-y-3 rounded-md border border-primary/40 bg-primary/5 p-4"
    >
      <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-primary uppercase">
        <KeyRound className="size-3.5" aria-hidden />
        Access code
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <code className="font-mono text-2xl font-bold tracking-[0.2em]">{link.accessCode}</code>
        <CopyButton value={link.accessCode} label="access code" />
      </div>
      <p className="text-xs text-muted-foreground">
        Copy it now — it won&apos;t be shown again. Share it with the client separately from the
        link (not in the same message).
      </p>
    </div>
  );
}

function ReportLinkUrl({ url }: { url: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <code className="min-w-0 flex-1 truncate font-mono text-[13px]">{url}</code>
      <CopyButton value={url} label="link URL" />
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

interface CardViewProps {
  status: ReportLinkStatus | null;
  /** The one-time code, present only right after Create/Rotate. */
  issued: IssuedReportLink | null;
  error: string | null;
  pending: boolean;
  createAction: (formData: FormData) => void;
  rotateAction: (formData: FormData) => void;
  revokeAction: (formData: FormData) => void;
}

/** Pure(ish) render of the card — testable without firing server actions. */
export function ReportLinkCardView({
  status,
  issued,
  error,
  pending,
  createAction,
  rotateAction,
  revokeAction,
}: CardViewProps) {
  const [confirming, setConfirming] = useState(false);

  const active = status?.active ?? false;
  // The issued link is active by definition, so the active body shows even if the
  // revalidated `status` hasn't arrived yet.
  const url = active ? status!.url : (issued?.url ?? null);
  const showActive = active || issued !== null;

  return (
    <section className="space-y-4 rounded-lg border bg-card p-5">
      <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
        <span className="text-primary">—</span>
        Report link
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {issued ? <IssuedAccessCode link={issued} /> : null}

      {showActive && url ? (
        <div className="space-y-4">
          <ReportLinkUrl url={url} />

          {active ? (
            <p className="font-mono text-xs text-muted-foreground">
              Created {formatDate(status!.createdAt)}
              {" · "}
              {status!.lastAccessedAt
                ? `last opened ${formatDate(status!.lastAccessedAt)}`
                : "not opened yet"}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <form action={rotateAction}>
              <Button type="submit" variant="outline" size="sm" disabled={pending}>
                <RotateCcw className="size-3.5" aria-hidden />
                Rotate
              </Button>
            </form>

            {confirming ? (
              <form action={revokeAction} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Revoke this link?</span>
                <Button type="submit" variant="destructive" size="sm" disabled={pending}>
                  Yes, revoke
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </Button>
              </form>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(true)}>
                Revoke
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Give this client a private, read-only link to their own live report. They open it with
            an Access Code you share out of band.
          </p>
          <form action={createAction}>
            <Button type="submit" disabled={pending}>
              <Plus aria-hidden />
              Create client link
            </Button>
          </form>
        </div>
      )}
    </section>
  );
}

/**
 * The mounted card: wires the three server actions with `useActionState` (same
 * idiom as add-client-dialog) and derives the one-time `issued` code from the
 * action results. `clientId` is passed separately because `status` is `null`
 * when there is no link (so it cannot carry the id the create action needs).
 */
export function ReportLinkCard({
  clientId,
  status,
}: {
  clientId: string;
  status: ReportLinkStatus | null;
}) {
  const [createState, createAction, createPending] = useActionState(
    createReportLinkAction.bind(null, clientId),
    IDLE,
  );
  const [rotateState, rotateAction, rotatePending] = useActionState(
    rotateReportLinkAction.bind(null, clientId),
    IDLE,
  );
  const [revokeState, revokeAction, revokePending] = useActionState(
    revokeReportLinkAction.bind(null, clientId),
    IDLE,
  );

  // The one-time code: rotate supersedes create; a revoke clears it so a stale
  // code never lingers after the link is gone.
  const issued: IssuedReportLink | null =
    revokeState.status === "revoked"
      ? null
      : rotateState.status === "issued"
        ? rotateState.link
        : createState.status === "issued"
          ? createState.link
          : null;

  const error =
    createState.status === "error"
      ? createState.message
      : rotateState.status === "error"
        ? rotateState.message
        : revokeState.status === "error"
          ? revokeState.message
          : null;

  return (
    <ReportLinkCardView
      status={status}
      issued={issued}
      error={error}
      pending={createPending || rotatePending || revokePending}
      createAction={createAction}
      rotateAction={rotateAction}
      revokeAction={revokeAction}
    />
  );
}
