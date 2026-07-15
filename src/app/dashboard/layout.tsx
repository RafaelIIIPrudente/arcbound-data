import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/dashboard/layout/side-nav";
import { navItems } from "@/components/dashboard/layout/nav-config";
import { TopBar } from "@/components/dashboard/layout/top-bar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { authDisabled } from "@/config";
import { getSession } from "@/lib/auth/session";
import { hasRole } from "@/lib/authz";
import { paths } from "@/paths";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!authDisabled && !user) redirect(paths.auth.signIn);

  const allowedHrefs = navItems
    .filter((item) => !item.roles || authDisabled || hasRole(user, ...item.roles))
    .map((item) => item.href);

  return (
    <SidebarProvider>
      <AppSidebar allowedHrefs={allowedHrefs} />
      <SidebarInset>
        <TopBar email={user?.email} />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
