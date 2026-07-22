import type { Metadata } from "next";

import { LoginBrandPanel } from "@/components/auth/login-brand-panel";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Wordmark } from "@/components/brand/wordmark";

export const metadata: Metadata = { title: "Log in" };

/**
 * The warm paper base and white card surface now come from globals.css, where
 * they apply app-wide — this page no longer redeclares them. What stays scoped
 * here is the tighter corner radius: Arcbound's corners are predominantly
 * sharp, and the product's 0.625rem default reads soft against paper. That is a
 * login-screen judgement, not something to impose on every dialog and table in
 * the app, so it lives on this wrapper.
 */
export default function LoginPage() {
  return (
    // The brand panel takes slightly MORE than half. An even split left the
    // form column so wide that the card floated in the middle of a void, while
    // the panel — the side actually carrying imagery — was cropped.
    <div className="grid min-h-svh bg-background [--radius:0.25rem] lg:grid-cols-[1.15fr_1fr]">
      {/* FORM FIRST IN THE DOM. On a phone this is what you land on; the brand
          panel follows below. Explicit grid placement puts it on the RIGHT at
          lg without reordering the markup, so the reading order stays correct
          for a screen reader at every width. */}
      <section className="flex flex-col justify-center px-6 py-12 sm:px-10 lg:col-start-2 lg:px-12">
        <div className="mx-auto w-full max-w-sm">
          {/* The brand panel is text-only below lg, so the lockup rides here
              instead — a bare "Sign in" card with no wordmark would leave a
              phone user with nothing identifying the product. */}
          <div className="mb-8 lg:hidden">
            <Wordmark className="text-2xl" />
            <div className="mt-1 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
              by Arcbound
            </div>
          </div>

          <SignInForm />
        </div>
      </section>

      <LoginBrandPanel />
    </div>
  );
}
