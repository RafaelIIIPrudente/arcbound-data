import type { Metadata } from "next";

import { RoleCards } from "@/components/dashboard/role-settings/role-cards";
import { requireRole } from "@/lib/authz.server";
import { listRoles } from "@/services/roles";

export const metadata: Metadata = { title: "Role settings" };

export default async function RoleSettingsPage() {
  // Defense in depth: middleware already gates this route to admins.
  await requireRole("admin", "superadmin");
  const roles = await listRoles();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Role settings</h1>
        <p className="text-sm text-muted-foreground">
          These roles are illustrative. Real access is enforced by the RBAC guard.
        </p>
      </div>
      <RoleCards roles={roles} />
    </div>
  );
}
