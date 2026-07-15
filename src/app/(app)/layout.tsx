import { redirect } from "next/navigation";

import { SideNav } from "@/components/dashboard/layout/side-nav";
import { TopBar } from "@/components/dashboard/layout/top-bar";
import { authDisabled } from "@/config";
import { getSession } from "@/lib/auth/session";
import { paths } from "@/paths";

/**
 * The ArcBase Dashboard Shell: sidebar + top bar hosting every authenticated
 * screen. Middleware already gates these routes; this layout re-checks the
 * session (defense in depth) and, when Supabase is unconfigured in dev, renders
 * the shell without a session so the UI is browsable.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!authDisabled && !user) redirect(paths.login);

  return (
    <div className="flex min-h-svh">
      <SideNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar email={user?.email} />
        <main className="w-full max-w-[1240px] flex-1 p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
