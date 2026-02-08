"use client";

import { ThemeToggle } from "@/components/theme-toggle";

export function ContentHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background">
      <div className="flex h-14 items-center justify-between px-4">
        <h1 className="text-lg font-semibold">Bluesky Word Trends</h1>
        <ThemeToggle />
      </div>
    </header>
  );
}
