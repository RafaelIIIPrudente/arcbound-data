import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { CustomerForm } from "@/components/dashboard/customer/customer-form";
import { Button } from "@/components/ui/button";
import { paths } from "@/paths";

import { createCustomerAction } from "../actions";

export const metadata: Metadata = { title: "New customer" };

export default function CreateCustomerPage() {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={paths.dashboard.customers.list}>
          <ArrowLeft />
          Back to customers
        </Link>
      </Button>
      <h1 className="text-2xl font-semibold tracking-tight">New customer</h1>
      <CustomerForm action={createCustomerAction} />
    </div>
  );
}
