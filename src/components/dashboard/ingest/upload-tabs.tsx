"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { OutreachUploadForm } from "./outreach-upload-form";
import { UploadForm } from "./upload-form";

type ClientOption = { id: string; name: string };

/**
 * The two upload shapes ArcBase accepts, on one route.
 *
 * ⚠️ THE SHADCN `<Tabs>` PRIMITIVE, NOT THE LINK-TABS IN `client-tabs.tsx`.
 * That file documents the rule: link-tabs exist for separate SERVER routes that
 * each own a data fetch and search params. These two are FORMS sharing one
 * `listClientRegistry()` read on one route — the settings case exactly — so
 * client-side tab state is right and a second route would buy nothing but an
 * extra round trip. There is deliberately no URL tab state: nothing here is
 * worth linking to, and a `?tab=` param would be one more thing to keep in sync.
 *
 * ⚠️ LINKEDIN IS THE DEFAULT, AND RENDERS THE EXISTING COMPONENT VERBATIM. The
 * metrics upload is the weekly routine and the path that already works; adding a
 * second service must not cost it a click or a single line of change.
 */
export function UploadTabs({ clients }: { clients: ClientOption[] }) {
  return (
    <Tabs defaultValue="linkedin">
      <TabsList>
        <TabsTrigger value="linkedin">LinkedIn Metrics</TabsTrigger>
        <TabsTrigger value="outreach">Outreach System</TabsTrigger>
      </TabsList>
      <TabsContent value="linkedin" className="pt-5">
        <UploadForm clients={clients} />
      </TabsContent>
      <TabsContent value="outreach" className="pt-5">
        <OutreachUploadForm clients={clients} />
      </TabsContent>
    </Tabs>
  );
}
