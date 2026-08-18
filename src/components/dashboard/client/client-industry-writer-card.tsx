"use client";

import { useActionState, useId, useState } from "react";

import {
  setClientIndustryWriterAction,
  type IndustryWriterState,
} from "@/app/(app)/clients/[id]/industry-writer-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type {
  ClientIndustry,
  ClientWriter,
  Industry,
  RegistryPickers,
  Writer,
} from "@/services/types";

// ─────────────────────────────────────────────────────────────────────────────
// A Client's Industry and Writer. Admin-editable; read-only for a Data Analyst,
// who still sees both because they are information about the Client, not
// authority over it — the same line `ClientServicesCard` draws.
//
// ═════════════════════════════════════════════════════════════════════════════
// ⚠️ `set_client_industry_writer` APPLIES BOTH ARGUMENTS, INCLUDING NULL.
//
// There is no partial update. Whatever this form does not post is CLEARED. That
// makes one omission catastrophic and invisible, so the rule here is absolute:
//
//   EVERY FIELD RENDERS EXACTLY ONE CONTROL THAT POSTS ITS CURRENT VALUE —
//   a <select> when there is something to choose from, otherwise a hidden input.
//
// Never both (two controls of one name would post two values, and the action
// reads the first), and never neither (an absent field is refused by the action,
// which is the backstop for exactly this mistake).
//
// Three situations make "something to choose from" false, and each one still has
// to carry the current value through:
//   • The registry read FAILED  → notice + hidden input. A writer change must not
//     erase an industry because an unrelated read was unwell.
//   • The registry is EMPTY     → notice pointing at Settings, Industries.
//   • The current value is not in the offered list → it is ADDED, marked. See the
//     ⚠️ on `industryOptions` — the trap this whole slice is organised around.
// ═════════════════════════════════════════════════════════════════════════════
//
// ⚠️ `NativeSelect`, NOT THE RADIX ONE — see `ui/native-select.tsx` for why.
// This form is uncontrolled on purpose: the browser posts exactly what is on
// screen, which is what carries an archived-but-current industry through an
// unrelated save — the same reason the Services card uses raw checkboxes.
// ─────────────────────────────────────────────────────────────────────────────

const IDLE: IndustryWriterState = { status: "idle" };

/** One entry in a picker. `label` is what an admin reads; `value` is what posts. */
interface Option {
  value: string;
  label: string;
}

/**
 * ⚠️ ACTIVE ROWS, PLUS THE CLIENT'S CURRENT INDUSTRY WHATEVER ITS STATUS (D9).
 *
 * The SQL deliberately keeps an archived industry assignable, so a Client can sit
 * in one. Combined with "every save re-sends both fields", a picker of active rows
 * only would have NO option matching that Client — the select would fall back to
 * its first option and the next save would silently move or clear the industry.
 *
 * An archived industry the Client is NOT in stays unoffered: archived means
 * retired, and assigning one afresh would resurrect it through a side door.
 */
function industryOptions(industries: Industry[], current: ClientIndustry | null): Option[] {
  const active = industries.filter((row) => row.status === "active");
  const options: Option[] = active.map((row) => ({ value: row.id, label: row.name }));

  if (current && !active.some((row) => row.id === current.id)) {
    const known = industries.find((row) => row.id === current.id);
    options.push({
      value: current.id,
      // ⚠️ ONLY SAY "ARCHIVED" WHEN THE REGISTRY SAID SO. If the current industry
      // is not in the list at all we did not read a status, and naming one would
      // be a claim about the registry dressed up as a claim about this Client —
      // the same mistake `ClientWriter` avoids by keeping "gone" and "unread"
      // apart. The foreign key should make this branch unreachable; it is here
      // because "should" is not "does", and a wrong label is worse than a plain one.
      label: known
        ? `${known.name} (archived)`
        : `${current.name} — no longer in the industries registry`,
    });
  }
  return options;
}

/**
 * ⚠️ THE SAME RULE, ON THE OTHER FIELD — and it is now literally the same code.
 *
 * Archiving a writer stops them being OFFERED; it does not evict the Clients
 * already recorded against them. So a picker of active rows only would have no
 * option matching such a Client, and — because every save re-sends BOTH fields —
 * an industry-only change would silently clear the writer.
 *
 * This function used to take the staff directory and hand back an id labelled
 * "assigned to an account that no longer exists". There is no directory and no
 * account: `writers` is a registry Clients point at by foreign key, exactly like
 * `industries` (D15).
 */
function writerOptions(writers: Writer[], current: ClientWriter | null): Option[] {
  const active = writers.filter((row) => row.status === "active");
  const options: Option[] = active.map((row) => ({ value: row.id, label: row.name }));

  if (current && !active.some((row) => row.id === current.id)) {
    const known = writers.find((row) => row.id === current.id);
    options.push({
      value: current.id,
      // ⚠️ ONLY SAY "ARCHIVED" WHEN THE REGISTRY SAID SO — the same reasoning as
      // `industryOptions` above. The foreign key should make the second branch
      // unreachable; it is here because "should" is not "does", and a wrong
      // label is worse than a plain one.
      label: known
        ? `${known.name} (archived)`
        : `${current.name} — no longer in the writers registry`,
    });
  }
  return options;
}

/**
 * The two current values as one comparable string — the form's saved baseline.
 * A space separates them; no uuid contains one, so no two ids can run together
 * into a third spelling.
 */
function stateKey(industryId: string, writerId: string): string {
  return `${industryId} ${writerId}`;
}

interface CardViewProps extends RegistryPickers {
  clientId: string;
  /** What this Client is recorded in now, or `null` for "not recorded". */
  industry: ClientIndustry | null;
  writer: ClientWriter | null;
  /**
   * ⚠️ REQUIRED, AND DELIBERATELY NOT DEFAULTED — same rule as `ClientServicesCard`
   * and `ReportLinkCard`. A default would let a new call site forget the question
   * and silently inherit the permissive answer.
   */
  isAdmin: boolean;
  state: IndustryWriterState;
  formAction: (formData: FormData) => void;
  pending: boolean;
}

export function ClientIndustryWriterCardView({
  clientId,
  industry,
  writer,
  industries,
  writers,
  isAdmin,
  state,
  formAction,
  pending,
}: CardViewProps) {
  const fieldId = useId();
  const currentIndustryId = industry?.id ?? "";
  const currentWriterId = writer?.id ?? "";

  const savedKey = stateKey(currentIndustryId, currentWriterId);
  const [baseline, setBaseline] = useState(savedKey);
  const [selection, setSelection] = useState(savedKey);
  const [settled, setSettled] = useState<IndustryWriterState | null>(null);

  // ⚠️ RE-BASELINE ON A COMPLETED SAVE, KEYED ON THE STATE OBJECT'S IDENTITY —
  // not on `status`. `useActionState` returns a NEW object per completed action and
  // the SAME one across ordinary re-renders, so this fires once per save. Comparing
  // `status` alone would re-baseline on every render while the card sat saved,
  // marking a freshly-changed field as "nothing to save". Copied from
  // `ClientServicesCard`, where that was a real bug.
  if (state.status === "saved" && state !== settled) {
    setSettled(state);
    setBaseline(selection);
  }

  const dirty = selection !== baseline;

  const header = (
    <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
      <span className="text-primary">—</span>
      Industry &amp; writer
    </div>
  );

  if (!isAdmin) {
    return (
      <section className="space-y-4 rounded-lg border bg-card p-5">
        {header}
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              Industry
            </dt>
            <dd className="mt-1 text-sm">{industry?.name ?? "Not recorded"}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              Writer
            </dt>
            <dd className="mt-1 text-sm">{writer?.name ?? "Not recorded"}</dd>
          </div>
        </dl>
      </section>
    );
  }

  const industryChoices = industries === null ? null : industryOptions(industries, industry);
  const writerChoices = writers === null ? null : writerOptions(writers, writer);

  return (
    <section className="space-y-4 rounded-lg border bg-card p-5">
      {header}

      <form
        action={formAction}
        // ONE listener reads the whole submitted state off the DOM, so nothing
        // here owns an input. Change events from both selects bubble to here.
        onChange={(event) => {
          const data = new FormData(event.currentTarget);
          setSelection(
            stateKey(String(data.get("industry_id") ?? ""), String(data.get("writer_id") ?? "")),
          );
        }}
        className="space-y-4"
      >
        <input type="hidden" name="client_id" value={clientId} />

        <div className="grid gap-4 sm:grid-cols-2">
          {/* ── Industry ─────────────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-industry`}>Industry</Label>
            {industryChoices === null ? (
              <>
                <p
                  role="alert"
                  aria-label="Industries registry"
                  className="text-xs text-destructive"
                >
                  The industries registry could not be read, so it cannot be changed here. This is
                  not the same as there being none — this client&apos;s current industry is kept as
                  it is.
                </p>
                {/* ⚠️ CARRIES THE CURRENT VALUE THROUGH. Omitting the field would let
                    a writer change erase the industry because a read failed. */}
                <input type="hidden" name="industry_id" value={currentIndustryId} />
              </>
            ) : industryChoices.length === 0 ? (
              <>
                <p
                  role="status"
                  aria-label="Industries registry"
                  className="text-xs text-muted-foreground"
                >
                  None yet — an admin adds them under Settings, Industries. This client can be
                  recorded in one as soon as there is one.
                </p>
                <input type="hidden" name="industry_id" value={currentIndustryId} />
              </>
            ) : (
              <NativeSelect
                id={`${fieldId}-industry`}
                name="industry_id"
                // ⚠️ `defaultValue`, NOT `value` — uncontrolled on purpose, so the
                // browser posts exactly what is on screen.
                defaultValue={currentIndustryId}
              >
                {/* "Not recorded" is a real answer, and the column is nullable to
                    hold it. It posts "", which the action turns into NULL. */}
                <option value="">Not recorded</option>
                {industryChoices.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </div>

          {/* ── Writer ───────────────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-writer`}>Writer</Label>
            {writerChoices === null ? (
              <>
                <p role="alert" aria-label="Writer directory" className="text-xs text-destructive">
                  The staff directory could not be read, so the writer cannot be changed here. This
                  client&apos;s current writer is kept as it is.
                </p>
                <input type="hidden" name="writer_id" value={currentWriterId} />
              </>
            ) : writerChoices.length === 0 ? (
              <>
                <p
                  role="status"
                  aria-label="Writer directory"
                  className="text-xs text-muted-foreground"
                >
                  No staff accounts to choose from.
                </p>
                <input type="hidden" name="writer_id" value={currentWriterId} />
              </>
            ) : (
              <NativeSelect
                id={`${fieldId}-writer`}
                name="writer_id"
                defaultValue={currentWriterId}
              >
                <option value="">Not recorded</option>
                {writerChoices.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Both are optional — &ldquo;not recorded&rdquo; is a legitimate answer for either. Saving
          writes both fields together.
        </p>

        {state.status === "error" ? (
          <p role="alert" className="text-xs text-destructive">
            {state.message}
          </p>
        ) : null}
        {/* ⚠️ ONLY WHILE IT IS STILL TRUE. "Saved." is a claim about what is ON
            SCREEN, so the moment a picker changes it becomes a lie and must go. */}
        {state.status === "saved" && !dirty ? (
          <p role="status" className="text-xs text-muted-foreground">
            {state.message}
          </p>
        ) : null}

        <Button type="submit" variant="outline" size="sm" disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save industry & writer"}
        </Button>
      </form>
    </section>
  );
}

/** The mounted card, wired to its action state. */
export function ClientIndustryWriterCard({
  clientId,
  industry,
  writer,
  industries,
  writers,
  isAdmin,
}: RegistryPickers & {
  clientId: string;
  industry: ClientIndustry | null;
  writer: ClientWriter | null;
  isAdmin: boolean;
}) {
  const [state, formAction, pending] = useActionState(setClientIndustryWriterAction, IDLE);

  return (
    <ClientIndustryWriterCardView
      clientId={clientId}
      industry={industry}
      writer={writer}
      industries={industries}
      writers={writers}
      isAdmin={isAdmin}
      state={state}
      formAction={formAction}
      pending={pending}
    />
  );
}
