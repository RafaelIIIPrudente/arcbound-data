"use client";

import { useActionState } from "react";

import { submitAccessCode, type GateState } from "./actions";

// ─────────────────────────────────────────────────────────────────────────────
// The Access Code gate. A Client with the URL but no session enters the
// out-of-band code here; the server action verifies it, sets the signed gate
// cookie, and redirects to the report.
//
// ⚠️ NO ORACLE IN THE COPY. There is ONE generic error for a bad link and a bad
// code alike ("link or Access Code isn't valid") — the wording must never reveal
// which was wrong. `locked` is the only other message ("try again later"). The
// error strings live as JS constants (not JSX text) so an apostrophe is safe and
// the message set is easy to audit in one place.
// ─────────────────────────────────────────────────────────────────────────────

const MESSAGES: Record<Exclude<GateState["status"], "idle">, string> = {
  invalid: "That link or Access Code isn't valid. Please check both and try again.",
  locked: "Too many attempts. Please try again in a little while.",
};

export function ReportLinkGate({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<GateState, FormData>(
    submitAccessCode.bind(null, token),
    { status: "idle" },
  );
  const error = state.status === "idle" ? null : MESSAGES[state.status];

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-sm flex-col justify-center">
      <div className="space-y-5 rounded-lg border bg-card p-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
            <span className="text-primary">—</span>
            Private report
          </div>
          <h1 className="font-display text-xl font-bold tracking-tight">Enter your Access Code</h1>
          <p className="text-sm text-muted-foreground">
            This report is private. Enter the Access Code you were given to view it.
          </p>
        </div>

        <form action={formAction} className="space-y-3">
          <label htmlFor="code" className="sr-only">
            Access Code
          </label>
          <input
            id="code"
            name="code"
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            required
            aria-invalid={state.status !== "idle"}
            aria-describedby={error ? "code-error" : undefined}
            placeholder="ACCESS CODE"
            className="w-full rounded-md border bg-background px-3 py-2 text-center font-mono tracking-[0.3em] uppercase focus:ring-2 focus:ring-ring focus:outline-none"
          />

          {error ? (
            <p id="code-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Checking…" : "View report"}
          </button>
        </form>
      </div>
    </div>
  );
}
