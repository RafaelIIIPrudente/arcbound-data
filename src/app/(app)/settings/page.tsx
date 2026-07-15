import type { Metadata } from "next";

import { SettingsTabs } from "@/components/dashboard/settings/settings-tabs";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await getSession();
  const email = user?.email ?? "";
  const fullName =
    typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile and security.</p>
      </div>
      <SettingsTabs email={email} fullName={fullName} />
    </div>
  );
}
