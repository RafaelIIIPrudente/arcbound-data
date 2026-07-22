"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { isSupabaseConfigured } from "@/config";
import { createClient } from "@/lib/supabase/client";
import { paths } from "@/paths";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
type Values = z.infer<typeof schema>;

export function SignInForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: Values) {
    if (!isSupabaseConfigured) {
      toast.error("Authentication isn't configured — set your Supabase environment variables.");
      return;
    }
    setPending(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword(values);
      if (error) {
        toast.error(error.message);
        return;
      }
      router.push(paths.home);
      router.refresh();
    } catch {
      toast.error("Couldn't reach the authentication service. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    // LIGHT: a white surface with a warm hairline on paper — that page/surface
    // contrast is the brand, and a drop shadow would read as a UI kit default.
    //
    // DARK: no chrome at all. A dark card on a near-black page adds no
    // separation, and beside the full-bleed brand panel it read as a stray
    // dialog floating in a void. Dropping the surface lets the form sit
    // directly on the ground — type and fields, the same register as the panel.
    <Card className="gap-5 rounded-xl border-border shadow-none dark:border-transparent dark:bg-transparent">
      <CardHeader className="gap-1.5">
        <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
          <span aria-hidden className="text-primary">
            —
          </span>
          ArcBase
        </div>
        <CardTitle className="font-display text-2xl leading-none font-extrabold tracking-tight">
          Sign in
        </CardTitle>
        <CardDescription>Enter your Arcbound credentials to continue.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  {/* Still a real <label> — FormLabel keeps the htmlFor wiring;
                      only its type treatment changed, to the app's mono idiom. */}
                  <FormLabel className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                    Email
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      autoComplete="email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between gap-3">
                    <FormLabel className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                      Password
                    </FormLabel>
                    <Link
                      href={paths.auth.resetPassword}
                      className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <FormControl>
                    <Input type="password" autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* `disabled={pending}` and the label swap are behaviour, untouched.
                The focus ring comes from Button's own focus-visible styles and
                is deliberately not overridden. */}
            <Button
              type="submit"
              className="w-full font-mono text-[11px] tracking-[0.14em] uppercase"
              disabled={pending}
            >
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
