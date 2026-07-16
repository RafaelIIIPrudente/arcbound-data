"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { isNavItemActive, navItems } from "./nav-config";

/**
 * Mobile navigation: a hamburger button (shown only below `md`) that opens the
 * sidebar's items in a Sheet. Mirrors the desktop SideNav, which is hidden on
 * small screens. Selecting an item closes the sheet.
 */
export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation menu">
          <Menu aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[264px] p-0">
        <SheetTitle className="sr-only">ArcBase navigation</SheetTitle>
        <SheetDescription className="sr-only">Main menu for ArcBase screens.</SheetDescription>

        <div className="border-b px-6 py-5">
          <Wordmark className="text-xl" />
          <div className="mt-1 font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase">
            by Arcbound
          </div>
        </div>

        <nav className="py-4">
          <div className="flex items-center gap-1.5 px-6 pb-2.5 font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase">
            <span className="text-primary">—</span>Menu
          </div>
          <ul>
            {navItems.map((item) => {
              const active = isNavItemActive(item.href, pathname);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className="relative flex items-center px-6 py-2.5 transition-colors hover:bg-accent/50"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "absolute top-1/2 left-0 h-4 w-[3px] -translate-y-1/2 bg-primary transition-opacity",
                        active ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span
                      className={cn(
                        "font-mono text-[11.5px] tracking-[0.06em]",
                        active ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {item.title}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
