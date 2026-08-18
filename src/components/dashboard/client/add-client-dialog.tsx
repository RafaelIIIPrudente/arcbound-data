"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { createClientAction, type ClientFormState } from "@/app/(app)/clients/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { ArcboundService, Industry, RegistryPickers, Writer } from "@/services/types";

const INITIAL: ClientFormState = { status: "idle" };

/**
 * Whether registering is finished enough to close the dialog.
 *
 * ⚠️ ONLY A CLEAN CREATION CLOSES. The other two "created" states exist to tell the
 * admin something about a Client that now EXISTS — that it has no services and
 * cannot receive uploads, or that its services failed to save. Closing on them
 * would report the consequence to nobody.
 *
 * It also prevents a duplicate: there is no unique constraint on `clients`
 * (ADR 0009), so an admin who is unsure whether it worked and clicks again ends up
 * with two. Leaving the dialog open with the outcome on it removes the doubt.
 */
export function shouldCloseAfter(state: ClientFormState): boolean {
  return state.status === "created";
}

/**
 * Whether the Client this form was submitting already EXISTS.
 *
 * ⚠️ ONCE TRUE, THE SUBMIT BUTTON MUST STAY DISABLED FOR GOOD — this is the fix
 * for a real bug, not a style choice. `created_without_services` and
 * `created_services_failed` deliberately leave the dialog OPEN so the message can
 * be read (see `shouldCloseAfter`), but the name/URL fields below are
 * UNCONTROLLED, so they still hold whatever was typed. A second click on "Add
 * client" at that point would resubmit the SAME name and URL and register a
 * SECOND Client — `clients` carries no unique constraint (ADR 0009), so nothing
 * downstream would catch it; it would simply exist. "Done" is the only correct
 * next action once this is true, which is why its label already changes here.
 */
function alreadyCreated(state: ClientFormState): boolean {
  return state.status === "created_without_services" || state.status === "created_services_failed";
}

export function AddClientDialog({
  services,
  industries,
  writers,
}: RegistryPickers & {
  services: ArcboundService[] | null;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden />
          Add new client
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Add new client</DialogTitle>
          <DialogDescription className="sr-only">
            Register a client by name, LinkedIn profile URL, and the services Arcbound provides for
            them.
          </DialogDescription>
        </DialogHeader>
        {/* Remounted on each open, so the action state starts clean every time. */}
        <AddClientForm
          onSuccess={close}
          services={services}
          industries={industries}
          writers={writers}
        />
      </DialogContent>
    </Dialog>
  );
}

interface FormViewProps {
  state: ClientFormState;
  formAction: (formData: FormData) => void;
  pending: boolean;
  /**
   * The registry, or `null` when it could not be read.
   *
   * ⚠️ `null` IS NOT "NO SERVICES". It means ArcBase could not list them.
   * `supabase/arcbound-services.sql` has been applied since 2026-08-14, so this
   * is now the uncommon case rather than the everyday one — but registering a
   * Client must never be blocked by a registry read either way, so the form says
   * so and carries on.
   */
  services: ArcboundService[] | null;
  /**
   * The industries registry, or `null` when it could not be read (D10).
   *
   * ⚠️ THE SAME THREE STATES AS `services`, AND THE SAME REASON. `null` means we
   * could not list them; `[]` means Arcbound has recorded none yet — which is the
   * state TODAY, so `[]` is the branch that renders on the first run and it must
   * point at the screen that fixes it. Collapsing the two would tell an admin the
   * registry is empty at the moment it might be full and unreachable.
   */
  industries: Industry[] | null;
  /** The writers registry, or `null` when it could not be read. */
  writers: Writer[] | null;
}

export function AddClientFormView({
  state,
  formAction,
  pending,
  services,
  industries,
  writers,
}: FormViewProps) {
  const errors = state.status === "error" ? state.errors : undefined;

  // ⚠️ ARCHIVED SERVICES ARE NEVER OFFERED HERE. On the Client Overview a held
  // archived Service is rendered so an unrelated save cannot silently drop it —
  // but a Client being registered right now holds nothing, so there is no history
  // to protect, and offering one would assign a retired offering afresh.
  const selectable = services?.filter((service) => service.status === "active") ?? [];
  const activeIndustries = industries?.filter((industry) => industry.status === "active") ?? [];
  // ⚠️ ACTIVE ONLY, AND UNLIKE THE OVERVIEW CARD THERE IS NO CURRENT VALUE TO
  // PRESERVE. A Client being registered has no writer yet, so offering an
  // archived one would resurrect a retired row through a side door.
  const activeWriters = writers?.filter((writer) => writer.status === "active") ?? [];

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          placeholder="e.g. Bryan Wish"
          autoComplete="off"
          aria-describedby="name-help"
        />
        <p id="name-help" className="text-xs text-muted-foreground">
          Use the exact LinkedIn display name (e.g. “Bryan Wish”) — posts are matched to the client
          by name.
        </p>
        {errors?.name?.[0] && <p className="text-sm text-destructive">{errors.name[0]}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="linkedin_url">LinkedIn URL</Label>
        <Input
          id="linkedin_url"
          name="linkedin_url"
          placeholder="https://linkedin.com/in/…"
          className="font-mono text-[13px]"
          autoComplete="off"
        />
        {errors?.linkedin_url?.[0] && (
          <p className="text-sm text-destructive">{errors.linkedin_url[0]}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Services</Label>
        {services === null ? (
          <p className="text-xs text-muted-foreground">
            Services could not be loaded, so none can be selected. The client will still be
            registered — assign services from their overview afterwards.
          </p>
        ) : selectable.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No services are registered yet. An admin adds them under Settings → Services.
          </p>
        ) : (
          <ul className="space-y-2">
            {selectable.map((service) => (
              <li key={service.id} className="flex items-center gap-2.5">
                <input
                  id={`service-${service.id}`}
                  type="checkbox"
                  name="service_id"
                  value={service.id}
                  className="size-4"
                />
                <label htmlFor={`service-${service.id}`} className="text-sm">
                  {service.name}
                </label>
              </li>
            ))}
          </ul>
        )}
        {/* ⚠️ SERVICES ARE OPTIONAL, BUT THE CONSEQUENCE IS NOT SILENT. A Client may
            be registered before the engagement is finalised; saying nothing would be
            the same silent outage the S1 backfill exists to prevent. */}
        <p className="text-xs text-muted-foreground">
          Optional. A client with no services cannot receive uploads until one is assigned.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="industry_id">Industry</Label>
        {/* ⚠️ ACTIVE ROWS ONLY, AND UNLIKE THE CLIENT OVERVIEW THAT IS COMPLETE.
            There, the picker must also offer an ARCHIVED industry the Client is
            already recorded in, or the next save would silently move or clear it.
            A Client being registered right now holds nothing, so there is no
            current value to preserve and offering a retired industry would only
            resurrect it. */}
        {industries === null ? (
          <p className="text-xs text-muted-foreground">
            Industries could not be loaded, so none can be selected. The client will still be
            registered — record their industry from their overview afterwards.
          </p>
        ) : industries.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No industries are registered yet. An admin adds them under Settings, Industries.
          </p>
        ) : activeIndustries.length === 0 ? (
          /* ⚠️ A THIRD STATE, NOT THE EMPTY ONE. The read succeeded and the
             registry is FULL — every row in it is archived, so nothing is
             offered. Sending an admin to "add them" here is false in the
             expensive direction: names are unique case-insensitively, so
             re-adding one hands them a constraint error for following the
             instruction. The way out is to restore one, which is a different
             screen action and a different sentence. */
          <p className="text-xs text-muted-foreground">
            Every industry is archived, so none can be selected. An admin can restore one under
            Settings, Industries — the client will still be registered without one.
          </p>
        ) : (
          <NativeSelect id="industry_id" name="industry_id" defaultValue="">
            <option value="">Not recorded</option>
            {activeIndustries.map((industry) => (
              <option key={industry.id} value={industry.id}>
                {industry.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="writer_id">Writer</Label>
        {writers === null ? (
          <p className="text-xs text-muted-foreground">
            Writers could not be loaded, so none can be selected. The client will still be
            registered — record their writer from their overview afterwards.
          </p>
        ) : writers.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No writers are registered yet. An admin adds them under Settings, Writers.
          </p>
        ) : activeWriters.length === 0 ? (
          /* ⚠️ THE THIRD STATE, EXACTLY AS ON THE INDUSTRY FIELD ABOVE. The read
             succeeded and the registry is FULL — every row in it is archived, so
             nothing is offered. Telling an admin to "add them" is false in the
             expensive direction: names are unique case-insensitively, so
             re-adding one hands them a constraint error for following the
             instruction. The way out is to restore one. */
          <p className="text-xs text-muted-foreground">
            Every writer is archived, so none can be selected. An admin can restore one under
            Settings, Writers — the client will still be registered without one.
          </p>
        ) : (
          <NativeSelect id="writer_id" name="writer_id" defaultValue="">
            <option value="">Not recorded</option>
            {activeWriters.map((writer) => (
              <option key={writer.id} value={writer.id}>
                {writer.name}
              </option>
            ))}
          </NativeSelect>
        )}
        {/* ⚠️ OPTIONAL, AND SAYING SO IS THE POINT. Neither field blocks
            registration; leaving both unset records "not recorded", which is true
            and is what every Client created before this slice already carries. */}
        <p className="text-xs text-muted-foreground">
          Both are optional and can be recorded later from the client&apos;s overview.
        </p>
      </div>

      {state.status === "created_services_failed" ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      {state.status === "created_without_services" ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}
      {state.status === "error" && state.message ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            {alreadyCreated(state) ? "Done" : "Cancel"}
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending || alreadyCreated(state)}>
          {pending ? "Adding…" : "Add client"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function AddClientForm({
  onSuccess,
  services,
  industries,
  writers,
}: RegistryPickers & {
  onSuccess: () => void;
  services: ArcboundService[] | null;
}) {
  const [state, formAction, pending] = useActionState(createClientAction, INITIAL);

  useEffect(() => {
    if (shouldCloseAfter(state)) onSuccess();
  }, [state, onSuccess]);

  return (
    <AddClientFormView
      state={state}
      formAction={formAction}
      pending={pending}
      services={services}
      industries={industries}
      writers={writers}
    />
  );
}
