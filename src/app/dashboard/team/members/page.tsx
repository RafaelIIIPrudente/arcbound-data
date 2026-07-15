import type { Metadata } from "next";

import { MembersTable } from "@/components/dashboard/team/members-table";
import { listMembers } from "@/services/team";

export const metadata: Metadata = { title: "Members" };

export default async function TeamMembersPage() {
  const members = await listMembers();
  return <MembersTable members={members} />;
}
