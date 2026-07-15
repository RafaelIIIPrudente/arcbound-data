import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { paths } from "@/paths";

export function Hero() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-24 text-center">
      <div className="mb-6 inline-flex rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
        Next.js · Supabase · shadcn/ui
      </div>
      <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl md:text-6xl">
        Ship your next app in minutes, not weeks
      </h1>
      <p className="mx-auto mt-6 max-w-xl text-lg text-pretty text-muted-foreground">
        A batteries-included starter with authentication, a dashboard, a reference CRUD feature,
        role-based access, tests, and CI. Clone it, rename it, build.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Button asChild size="lg">
          <Link href={paths.auth.signUp}>
            Get started
            <ArrowRight />
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href={paths.dashboard.overview}>View dashboard</Link>
        </Button>
      </div>
    </section>
  );
}
