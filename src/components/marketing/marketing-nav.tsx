import Link from "next/link";
import { Boxes } from "lucide-react";

import { ModeToggle } from "@/components/theme/mode-toggle";
import { Button } from "@/components/ui/button";
import { config } from "@/config";
import { paths } from "@/paths";

export function MarketingNav() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href={paths.home} className="flex items-center gap-2 font-semibold">
          <Boxes className="size-5" />
          <span>{config.site.name}</span>
        </Link>
        <div className="flex items-center gap-2">
          <ModeToggle />
          <Button asChild variant="ghost">
            <Link href={paths.auth.signIn}>Sign in</Link>
          </Button>
          <Button asChild>
            <Link href={paths.auth.signUp}>Get started</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
