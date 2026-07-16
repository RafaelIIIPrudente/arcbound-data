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

const INITIAL: ClientFormState = { ok: false };

export function AddClientDialog() {
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
            Register a client by name and LinkedIn profile URL.
          </DialogDescription>
        </DialogHeader>
        {/* Remounted on each open, so the action state starts clean every time. */}
        <AddClientForm onSuccess={close} />
      </DialogContent>
    </Dialog>
  );
}

function AddClientForm({ onSuccess }: { onSuccess: () => void }) {
  const [state, formAction, pending] = useActionState(createClientAction, INITIAL);

  useEffect(() => {
    if (state.ok) onSuccess();
  }, [state.ok, onSuccess]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" placeholder="e.g. Priya Nadella" autoComplete="off" />
        {state.errors?.name?.[0] && (
          <p className="text-sm text-destructive">{state.errors.name[0]}</p>
        )}
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
        {state.errors?.linkedin_url?.[0] && (
          <p className="text-sm text-destructive">{state.errors.linkedin_url[0]}</p>
        )}
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add client"}
        </Button>
      </DialogFooter>
    </form>
  );
}
