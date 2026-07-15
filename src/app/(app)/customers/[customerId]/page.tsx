import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { CustomerForm } from "@/components/dashboard/customer/customer-form";
import { DeleteCustomerDialog } from "@/components/dashboard/customer/delete-customer-dialog";
import { Button } from "@/components/ui/button";
import { paths } from "@/paths";
import { getCustomer } from "@/services/customers";

import { updateCustomerAction } from "../actions";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const customer = await getCustomer(customerId);
  if (!customer) notFound();

  return (
    <div className="max-w-2xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={paths.customers.list}>
          <ArrowLeft />
          Back to customers
        </Link>
      </Button>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{customer.name}</h1>
          <p className="text-sm text-muted-foreground">{customer.email}</p>
        </div>
        <DeleteCustomerDialog id={customer.id} name={customer.name} />
      </div>
      <CustomerForm action={updateCustomerAction.bind(null, customer.id)} customer={customer} />
    </div>
  );
}
