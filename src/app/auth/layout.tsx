import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";
import { paths } from "@/paths";

// Centred frame for the retained auth screens (password reset / update).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <Link href={paths.login} className="inline-block">
        <Wordmark className="text-2xl" />
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
