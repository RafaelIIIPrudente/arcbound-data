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
import type { ArcboundService } from "@/services/types";

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

export function AddClientDialog({ services }: { services: ArcboundService[] | null }) {
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
        <AddClientForm onSuccess={close} services={services} />
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
   * ⚠️ `null` IS NOT "NO SERVICES". It means ArcBase could not list them — true
   * right now, because `supabase/arcbound-services.sql` is not applied. Registering
   * a Client must not be blocked by that, so the form says so and carries on.
   */
  services: ArcboundService[] | null;
}

export function AddClientFormView({ state, formAction, pending, services }: FormViewProps) {
  const errors = state.status === "error" ? state.errors : undefined;

  // ⚠️ ARCHIVED SERVICES ARE NEVER OFFERED HERE. On the Client Overview a held
  // archived Service is rendered so an unrelated save cannot silently drop it —
  // but a Client being registered right now holds nothing, so there is no history
  // to protect, and offering one would assign a retired offering afresh.
  const selectable = services?.filter((service) => service.status === "active") ?? [];

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
            {state.status === "created_without_services" ||
            state.status === "created_services_failed"
              ? "Done"
              : "Cancel"}
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add client"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function AddClientForm({
  onSuccess,
  services,
}: {
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
    />
  );
}
