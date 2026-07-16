"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { createResourceAction, type ResourceFormState } from "@/app/(app)/resources/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL: ResourceFormState = { ok: false };

export function AddResourceDialog() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Add resource
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Add resource</DialogTitle>
        </DialogHeader>
        {/* Remounted on each open, so the action state starts clean every time. */}
        <AddResourceForm onSuccess={close} />
      </DialogContent>
    </Dialog>
  );
}

function AddResourceForm({ onSuccess }: { onSuccess: () => void }) {
  const [state, formAction, pending] = useActionState(createResourceAction, INITIAL);

  useEffect(() => {
    if (state.ok) onSuccess();
  }, [state.ok, onSuccess]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          placeholder="e.g. Scrape bookmarklet setup"
          autoComplete="off"
        />
        {state.errors?.title?.[0] && (
          <p className="text-sm text-destructive">{state.errors.title[0]}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="url">Link</Label>
        <Input
          id="url"
          name="url"
          placeholder="https://…"
          className="font-mono text-[13px]"
          autoComplete="off"
        />
        {state.errors?.url?.[0] && (
          <p className="text-sm text-destructive">{state.errors.url[0]}</p>
        )}
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add resource"}
        </Button>
      </DialogFooter>
    </form>
  );
}
