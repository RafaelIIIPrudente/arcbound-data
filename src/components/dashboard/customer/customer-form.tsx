"use client";

import { useActionState } from "react";

import type { CustomerFormState } from "@/app/(app)/customers/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Customer } from "@/services/types";

const INITIAL: CustomerFormState = { ok: false };

type Action = (prev: CustomerFormState, formData: FormData) => Promise<CustomerFormState>;

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  error,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  error?: string[];
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={defaultValue} />
      {error?.[0] && <p className="text-sm text-destructive">{error[0]}</p>}
    </div>
  );
}

export function CustomerForm({ action, customer }: { action: Action; customer?: Customer }) {
  const [state, formAction, pending] = useActionState(action, INITIAL);

  return (
    <form action={formAction} className="max-w-lg space-y-4">
      <Field label="Name" name="name" defaultValue={customer?.name} error={state.errors?.name} />
      <Field
        label="Email"
        name="email"
        type="email"
        defaultValue={customer?.email}
        error={state.errors?.email}
      />
      <Field
        label="Company"
        name="company"
        defaultValue={customer?.company}
        error={state.errors?.company}
      />
      <div className="space-y-2">
        <Label htmlFor="status">Status</Label>
        <Select name="status" defaultValue={customer?.status ?? "active"}>
          <SelectTrigger id="status" className="w-full">
            <SelectValue placeholder="Select a status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
          </SelectContent>
        </Select>
        {state.errors?.status?.[0] && (
          <p className="text-sm text-destructive">{state.errors.status[0]}</p>
        )}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : customer ? "Save changes" : "Create customer"}
      </Button>
    </form>
  );
}
