import type { Metadata } from "next";
import Link from "next/link";

import { SettingsTabs } from "@/components/dashboard/settings/settings-tabs";
import { getRole, isAdmin } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { paths } from "@/paths";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [user, role] = await Promise.all([getSession(), getRole()]);
  const email = user?.email ?? "";
  const fullName =
    typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "";

  // ⚠️ THIS PAGE STAYS UNGUARDED, AND THE LINK IS THE ONLY ROLE-AWARE PART.
  //
  // Staff Roles lives at its own route precisely so `requireAdmin()` never has to
  // run here: this is where an analyst manages their own profile and password.
  // Guarding the whole page to hide one link would lock them out of their own
  // account settings. Only the link is conditional (ADR 0013).
  const admin = isAdmin(role);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your profile and security.</p>
        </div>
        {admin ? (
          <Link
            href={paths.settings.roles}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Staff roles
          </Link>
        ) : null}
      </div>
      <SettingsTabs email={email} fullName={fullName} />
    </div>
  );
}
