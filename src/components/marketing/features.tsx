import { Database, LayoutDashboard, ShieldCheck, TestTube2, Palette, Lock } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  {
    icon: Lock,
    title: "Supabase auth",
    description:
      "Sign-in, sign-up, and password reset wired to Supabase, with session-aware middleware.",
  },
  {
    icon: LayoutDashboard,
    title: "Dashboard shell",
    description: "Collapsible sidebar, top bar, and light/dark theming out of the box.",
  },
  {
    icon: Database,
    title: "Typed service seam",
    description:
      "Screens read through a typed seam that returns mock data — swap to a real backend in one file.",
  },
  {
    icon: ShieldCheck,
    title: "Role-based access",
    description: "Route and component guards driven by the user's role, enforced in middleware.",
  },
  {
    icon: TestTube2,
    title: "Tests & CI",
    description:
      "Vitest, Testing Library, and Playwright examples, wired into a GitHub Actions pipeline.",
  },
  {
    icon: Palette,
    title: "shadcn/ui + Tailwind v4",
    description:
      "Own your components. Accessible primitives, themeable tokens, no runtime design-system lock-in.",
  },
];

export function Features() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <Card key={feature.title}>
            <CardHeader>
              <feature.icon className="size-6 text-primary" />
              <CardTitle className="mt-2 text-base">{feature.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{feature.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
