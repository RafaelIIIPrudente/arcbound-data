import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { paths } from "@/paths";

export const metadata: Metadata = { title: "Confirm your email" };

export default function SignUpConfirmPage() {
  return (
    <Card>
      <CardHeader className="items-center text-center">
        <MailCheck className="size-8 text-muted-foreground" />
        <CardTitle className="text-xl">Check your email</CardTitle>
        <CardDescription>
          We sent you a confirmation link. Click it to activate your account, then sign in.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center">
        <Link href={paths.auth.signIn} className="text-sm hover:underline">
          Back to sign in
        </Link>
      </CardContent>
    </Card>
  );
}
