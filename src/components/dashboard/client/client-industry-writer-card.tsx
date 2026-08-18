"use client";

import { useActionState, useId, useState } from "react";

import {
  setClientIndustryWriterAction,
  type IndustryWriterState,
} from "@/app/(app)/clients/[id]/industry-writer-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { StaffDirectoryEntry } from "@/services/staff";
import type { ClientIndustry, ClientWriter, Industry } from "@/services/types";

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
// ⚠️ NATIVE <select>, NOT THE RADIX ONE, AND THAT IS A DECISION. This form is
// uncontrolled on purpose: the browser posts exactly what is on screen, which is
// what carries an archived-but-current industry through an unrelated save — the
// same reason the Services card uses raw checkboxes. A native select also spells
// "not recorded" as a plain empty option; Radix rejects `value=""` and would need
// a sentinel string mapped back to NULL, i.e. one more place the wipe could hide.
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
    options.push({ value: current.id, label: `${known?.name ?? current.name} (archived)` });
  }
  return options;
}

/**
 * ⚠️ THE SAME TRAP, ON THE OTHER FIELD. A writer assigned to an account that has
 * since left the directory has no matching option, so an INDUSTRY-only change
 * would clear the writer. Offer the id itself, named for what it is.
 */
function writerOptions(staff: StaffDirectoryEntry[], currentId: string | null): Option[] {
  const options: Option[] = staff.map((entry) => ({ value: entry.userId, label: entry.email }));

  if (currentId && !staff.some((entry) => entry.userId === currentId)) {
    options.push({ value: currentId, label: `${currentId} — no longer a staff account` });
  }
  return options;
}

/** What an analyst is told about a writer, in the four states `ClientWriter` has. */
function writerText(writer: ClientWriter): string {
  if (writer === null) return "Not recorded";
  if (writer.status === "resolved") return writer.email;
  // ⚠️ THESE TWO ARE NOT THE SAME AND MUST NOT READ AS "NOBODY". One is a broken
  // link, the other is a broken read; collapsing either into "Not recorded" would
  // report a staffing gap that does not exist.
  if (writer.status === "unknown") return "Assigned to an account that no longer exists";
  return "Assigned, but the staff directory could not be looked up";
}

/**
 * The two current values as one comparable string — the form's saved baseline.
 * A space separates them; no uuid contains one, so no two ids can run together
 * into a third spelling.
 */
function stateKey(industryId: string, writerId: string): string {
  return `${industryId} ${writerId}`;
}

interface CardViewProps {
  clientId: string;
  /** What this Client is recorded in now, or `null` for "not recorded". */
  industry: ClientIndustry | null;
  writer: ClientWriter;
  /** The registry, or `null` when it could not be read. ⚠️ `[]` IS NOT `null`. */
  industries: Industry[] | null;
  /** The staff directory, or `null` when it could not be read. */
  staff: StaffDirectoryEntry[] | null;
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

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

export function ClientIndustryWriterCardView({
  clientId,
  industry,
  writer,
  industries,
  staff,
  isAdmin,
  state,
  formAction,
  pending,
}: CardViewProps) {
  const fieldId = useId();
  const currentIndustryId = industry?.id ?? "";
  const currentWriterId = writer?.userId ?? "";

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
            <dd className="mt-1 text-sm">{writerText(writer)}</dd>
          </div>
        </dl>
      </section>
    );
  }

  const industryChoices = industries === null ? null : industryOptions(industries, industry);
  const writerChoices = staff === null ? null : writerOptions(staff, writer?.userId ?? null);

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
              <select
                id={`${fieldId}-industry`}
                name="industry_id"
                // ⚠️ `defaultValue`, NOT `value` — uncontrolled on purpose, so the
                // browser posts exactly what is on screen.
                defaultValue={currentIndustryId}
                className={SELECT_CLASS}
              >
                {/* "Not recorded" is a real answer, and the column is nullable to
                    hold it. It posts "", which the action turns into NULL. */}
                <option value="">Not recorded</option>
                {industryChoices.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
              <select
                id={`${fieldId}-writer`}
                name="writer_id"
                defaultValue={currentWriterId}
                className={SELECT_CLASS}
              >
                <option value="">Not recorded</option>
                {writerChoices.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
  staff,
  isAdmin,
}: {
  clientId: string;
  industry: ClientIndustry | null;
  writer: ClientWriter;
  industries: Industry[] | null;
  staff: StaffDirectoryEntry[] | null;
  isAdmin: boolean;
}) {
  const [state, formAction, pending] = useActionState(setClientIndustryWriterAction, IDLE);

  return (
    <ClientIndustryWriterCardView
      clientId={clientId}
      industry={industry}
      writer={writer}
      industries={industries}
      staff={staff}
      isAdmin={isAdmin}
      state={state}
      formAction={formAction}
      pending={pending}
    />
  );
}
