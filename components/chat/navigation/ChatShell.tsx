"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";

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
  const pathname = usePathname();
  const mobileTriggerRef = useRef<HTMLButtonElement | null>(null);
  const mobileDrawerRef = useRef<HTMLElement | null>(null);
  const previousPathnameRef = useRef(pathname);
  const returnFocusRef = useRef(false);
  const wasMobileSidebarOpenRef = useRef(false);

  const closeMobileSidebar = useCallback(() => {
    returnFocusRef.current = true;
    setMobileSidebarOpen(false);
  }, []);

  useEffect(() => {
    if (previousPathnameRef.current !== pathname) {
      previousPathnameRef.current = pathname;
      closeMobileSidebar();
    }
  }, [closeMobileSidebar, pathname]);

  useEffect(() => {
    if (
      wasMobileSidebarOpenRef.current &&
      !mobileSidebarOpen &&
      returnFocusRef.current
    ) {
      mobileTriggerRef.current?.focus({ preventScroll: true });
      returnFocusRef.current = false;
    }
    wasMobileSidebarOpenRef.current = mobileSidebarOpen;
  }, [mobileSidebarOpen]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;

    const drawer = mobileDrawerRef.current;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusableSelector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");
    const getFocusableElements = () =>
      drawer
        ? Array.from(drawer.querySelectorAll<HTMLElement>(focusableSelector))
        : [];

    const focusableElements = getFocusableElements();
    (focusableElements[0] ?? drawer)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMobileSidebar();
        return;
      }
      if (event.key !== "Tab") return;

      const elements = getFocusableElements();
      if (elements.length === 0) {
        event.preventDefault();
        drawer?.focus();
        return;
      }

      const first = elements[0];
      const last = elements[elements.length - 1];
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || !drawer?.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || !drawer?.contains(activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }

    const desktopQuery = window.matchMedia?.("(min-width: 768px)");
    function handleDesktopChange(event: MediaQueryListEvent) {
      if (event.matches) closeMobileSidebar();
    }

    document.addEventListener("keydown", handleKeyDown);
    desktopQuery?.addEventListener("change", handleDesktopChange);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      desktopQuery?.removeEventListener("change", handleDesktopChange);
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [closeMobileSidebar, mobileSidebarOpen]);

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

        {sidebar && (
          <button
            ref={mobileTriggerRef}
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open navigation"
            className="fixed left-3 top-3 z-30 flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background text-lg shadow-sm md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        <main
          inert={mobileSidebarOpen}
          aria-hidden={mobileSidebarOpen || undefined}
          className={[
            "relative min-w-0 flex-1",
            constrainToViewport
              ? "min-h-0 overflow-hidden"
              : "",
          ].join(" ")}
        >
          {children}
        </main>
      </div>

      {sidebar && mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={closeMobileSidebar}
            className="absolute inset-0 bg-black/60"
          />

          <aside
            ref={mobileDrawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            tabIndex={-1}
            className="absolute inset-y-0 left-0 w-[85%] max-w-80 border-r border-border bg-background shadow-xl"
          >
            <div className="flex h-dvh flex-col p-4">
              <div className="mb-3 flex justify-end">
                <button
                  type="button"
                  onClick={closeMobileSidebar}
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
