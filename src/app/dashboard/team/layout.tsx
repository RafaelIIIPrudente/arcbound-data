import { TeamTabs } from "@/components/dashboard/team/team-tabs";

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-sm text-muted-foreground">Members and role permissions.</p>
      </div>
      <TeamTabs />
      {children}
    </div>
  );
}
