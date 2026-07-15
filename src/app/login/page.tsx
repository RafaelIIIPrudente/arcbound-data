import type { Metadata } from "next";

import { SignInForm } from "@/components/auth/sign-in-form";
import { Wordmark } from "@/components/brand/wordmark";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <Wordmark className="text-2xl" />
          <div className="mt-1 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
            LinkedIn post metrics
          </div>
        </div>
        <SignInForm />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-6 text-center font-mono text-[10px] tracking-[0.22em] text-muted-foreground uppercase">
        Confidential · Arcbound internal
      </div>
    </div>
  );
}
