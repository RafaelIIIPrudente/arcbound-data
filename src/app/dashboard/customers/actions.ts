"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createCustomer, deleteCustomer, updateCustomer } from "@/services/customers";
import { paths } from "@/paths";

const customerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
  company: z.string().min(1, "Company is required"),
  status: z.enum(["active", "blocked", "pending"]),
});

export interface CustomerFormState {
  ok: boolean;
  errors?: Record<string, string[]>;
}

export async function createCustomerAction(
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const parsed = customerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }
  const created = await createCustomer(parsed.data);
  revalidatePath(paths.dashboard.customers.list);
  redirect(paths.dashboard.customers.details(created.id));
}

export async function updateCustomerAction(
  id: string,
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const parsed = customerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }
  await updateCustomer(id, parsed.data);
  revalidatePath(paths.dashboard.customers.list);
  revalidatePath(paths.dashboard.customers.details(id));
  redirect(paths.dashboard.customers.details(id));
}

export async function deleteCustomerAction(id: string): Promise<void> {
  await deleteCustomer(id);
  revalidatePath(paths.dashboard.customers.list);
  redirect(paths.dashboard.customers.list);
}
