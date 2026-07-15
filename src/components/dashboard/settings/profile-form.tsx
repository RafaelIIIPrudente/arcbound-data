"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isSupabaseConfigured } from "@/config";
import { createClient } from "@/lib/supabase/client";

const schema = z.object({ fullName: z.string().min(1, "Name is required") });
type Values = z.infer<typeof schema>;

export function ProfileForm({ email, fullName }: { email: string; fullName: string }) {
  const [pending, setPending] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { fullName } });

  async function onSubmit(values: Values) {
    if (!isSupabaseConfigured) {
      toast.error("Authentication isn't configured — set your Supabase environment variables.");
      return;
    }
    setPending(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ data: { full_name: values.fullName } });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Profile updated");
    } catch {
      toast.error("Couldn't reach the authentication service. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-lg space-y-4">
        <div className="space-y-2">
          <Label>Email</Label>
          <Input value={email} disabled />
          <p className="text-sm text-muted-foreground">
            Your email is managed by your auth provider.
          </p>
        </div>
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full name</FormLabel>
              <FormControl>
                <Input placeholder="Your name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
      </form>
    </Form>
  );
}
