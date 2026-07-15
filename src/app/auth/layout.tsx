import Link from "next/link";
import { Boxes } from "lucide-react";

import { config } from "@/config";
import { paths } from "@/paths";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <Link href={paths.home} className="flex items-center gap-2 text-lg font-semibold">
        <Boxes className="size-6" />
        <span>{config.site.name}</span>
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
