"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Menu, X } from "lucide-react";

type ChatShellProps = {
  children: ReactNode;
  sidebar?: ReactNode;
  constrainToViewport?: boolean;
};

export function ChatShell({
  children,
  sidebar,
  constrainToViewport = false,
}: ChatShellProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div
      className={[
        "bg-background text-foreground",
        constrainToViewport
          ? "h-dvh overflow-hidden"
          : "min-h-dvh",
      ].join(" ")}
    >
      <div
        className={[
          "mx-auto flex w-full max-w-7xl",
          constrainToViewport
            ? "h-full min-h-0"
            : "min-h-dvh",
        ].join(" ")}
      >
        {sidebar && (
          <aside className="hidden w-72 shrink-0 border-r border-border md:block">
            <div className="sticky top-0 h-dvh overflow-y-auto p-4">
              {sidebar}
            </div>
          </aside>
        )}

        <main
          className={[
            "relative min-w-0 flex-1",
            constrainToViewport
              ? "min-h-0 overflow-hidden"
              : "",
          ].join(" ")}
        >
          {sidebar && (
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open navigation"
              className="fixed left-3 top-3 z-30 flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background text-lg shadow-sm md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}

          {children}
        </main>
      </div>

      {sidebar && mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileSidebarOpen(false)}
            className="absolute inset-0 bg-black/60"
          />

          <aside className="absolute inset-y-0 left-0 w-[85%] max-w-80 border-r border-border bg-background shadow-xl">
            <div className="flex h-dvh flex-col p-4">
              <div className="mb-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => setMobileSidebarOpen(false)}
                  aria-label="Close navigation"
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-xl text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {sidebar}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
