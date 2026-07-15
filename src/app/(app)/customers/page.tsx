import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { CustomersTable } from "@/components/dashboard/customer/customers-table";
import { Button } from "@/components/ui/button";
import { paths } from "@/paths";
import { listCustomers } from "@/services/customers";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const { items } = await listCustomers({ q, pageSize: 100 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground">
            The reference CRUD feature — copy it to build your own.
          </p>
        </div>
        <Button asChild>
          <Link href={paths.customers.create}>
            <Plus />
            New customer
          </Link>
        </Button>
      </div>
      <CustomersTable data={items} />
    </div>
  );
}
