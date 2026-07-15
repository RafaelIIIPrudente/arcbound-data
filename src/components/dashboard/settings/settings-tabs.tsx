"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { PasswordForm } from "./password-form";
import { ProfileForm } from "./profile-form";

export function SettingsTabs({ email, fullName }: { email: string; fullName: string }) {
  return (
    <Tabs defaultValue="profile" className="max-w-2xl">
      <TabsList>
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="security">Security</TabsTrigger>
      </TabsList>
      <TabsContent value="profile" className="pt-4">
        <ProfileForm email={email} fullName={fullName} />
      </TabsContent>
      <TabsContent value="security" className="pt-4">
        <PasswordForm />
      </TabsContent>
    </Tabs>
  );
}
