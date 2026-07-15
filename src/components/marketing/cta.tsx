import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { paths } from "@/paths";

export function CTA() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <div className="flex flex-col items-center gap-4 rounded-xl bg-muted px-6 py-14 text-center">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Start building today</h2>
        <p className="max-w-md text-muted-foreground">
          Everything you need to go from clone to production is already here.
        </p>
        <Button asChild size="lg">
          <Link href={paths.auth.signUp}>
            Create your account
            <ArrowRight />
          </Link>
        </Button>
      </div>
    </section>
  );
}
