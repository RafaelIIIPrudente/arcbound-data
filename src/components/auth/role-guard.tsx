import * as React from "react";

import { authDisabled } from "@/config";
import { getSession } from "@/lib/auth/session";
import { hasRole, type Role } from "@/lib/authz";

interface RoleGuardProps {
  role: Role | Role[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Server component that renders `children` only if the current user holds one
 * of the given roles, otherwise `fallback` (nothing by default).
 */
export async function RoleGuard({ role, children, fallback = null }: RoleGuardProps) {
  if (authDisabled) return <>{children}</>;
  const user = await getSession();
  const allowed = Array.isArray(role) ? role : [role];
  return hasRole(user, ...allowed) ? <>{children}</> : <>{fallback}</>;
}
