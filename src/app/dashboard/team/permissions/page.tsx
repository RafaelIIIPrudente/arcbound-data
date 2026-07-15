import type { Metadata } from "next";

import { PermissionsMatrix } from "@/components/dashboard/team/permissions-matrix";
import { listPermissionGroups } from "@/services/team";

export const metadata: Metadata = { title: "Permissions" };

export default async function TeamPermissionsPage() {
  const groups = await listPermissionGroups();
  return <PermissionsMatrix groups={groups} />;
}
