import {
  FileText,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import type { Role } from "@/lib/authz";
import { paths } from "@/paths";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** If set, the item is only shown to users holding one of these roles. */
  roles?: Role[];
}

export const navItems: NavItem[] = [
  { title: "Overview", href: paths.dashboard.overview, icon: LayoutDashboard },
  { title: "Customers", href: paths.dashboard.customers.list, icon: Users },
  { title: "Team", href: paths.dashboard.team.members, icon: UsersRound },
  {
    title: "Role settings",
    href: paths.dashboard.roleSettings,
    icon: ShieldCheck,
    roles: ["admin", "superadmin"],
  },
  { title: "Settings", href: paths.dashboard.settings.profile, icon: Settings },
  { title: "Blank", href: paths.dashboard.blank, icon: FileText },
];
