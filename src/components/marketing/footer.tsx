import { config } from "@/config";

export function Footer() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 text-sm text-muted-foreground">
        <span>{config.site.name}</span>
        <span>Built with Next.js, Supabase &amp; shadcn/ui</span>
      </div>
    </footer>
  );
}
