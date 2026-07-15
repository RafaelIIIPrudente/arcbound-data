import { ModeToggle } from "@/components/theme/mode-toggle";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

import { UserMenu } from "./user-menu";

export function TopBar({ email }: { email?: string }) {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <div className="ml-auto flex items-center gap-2">
        <ModeToggle />
        <UserMenu email={email} />
      </div>
    </header>
  );
}
