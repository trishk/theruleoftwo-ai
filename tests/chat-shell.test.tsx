// @vitest-environment jsdom

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/current",
}));

import { ChatShell } from "@/components/chat/navigation/ChatShell";

let desktopListener: ((event: MediaQueryListEvent) => void) | undefined;

beforeEach(() => {
  document.body.style.overflow = "";
  desktopListener = undefined;
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        desktopListener = listener;
      },
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        if (desktopListener === listener) desktopListener = undefined;
      },
    }))
  );
});

function renderShell() {
  return render(
    <ChatShell
      sidebar={
        <>
          <a href="/first">First destination</a>
          <button type="button">Last action</button>
          <button type="button" className="h-11 w-11 md:h-9 md:w-9">Theme control</button>
        </>
      }
    >
      <button type="button">Background action</button>
    </ChatShell>
  );
}

describe("ChatShell mobile drawer", () => {
  it("opens as a modal dialog, moves focus inside, and closes from the overlay", () => {
    renderShell();
    const trigger = screen.getByRole("button", { name: "Open navigation" });

    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Navigation menu" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByRole("button", { name: "Close navigation" })).toHaveFocus();
    expect(screen.getByRole("main", { hidden: true })).toHaveAttribute("inert");
    expect(screen.getByRole("main", { hidden: true })).toHaveAttribute("aria-hidden", "true");
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(screen.getAllByRole("button", { name: "Close navigation" })[0]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(screen.getByRole("main")).not.toHaveAttribute("inert");
    expect(screen.getByRole("main")).not.toHaveAttribute("aria-hidden");
    expect(document.body.style.overflow).toBe("");
  });

  it("closes with Escape, returns focus, and does not intercept keys while closed", () => {
    renderShell();
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    screen.getByRole("button", { name: "Background action" }).focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Background action" })).toHaveFocus();
  });

  it("wraps Tab and Shift+Tab within the drawer", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));

    const dialog = screen.getByRole("dialog");
    const close = within(dialog).getByRole("button", {
      name: "Close navigation",
    });
    const last = within(dialog).getByRole("button", { name: "Theme control" });
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus();

    close.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("includes the shared theme control in the mobile focus trap with a mobile touch target", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));

    const themeControl = within(screen.getByRole("dialog")).getByRole("button", {
      name: "Theme control",
    });
    expect(themeControl).toHaveClass("h-11", "w-11", "md:h-9", "md:w-9");

    themeControl.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(within(screen.getByRole("dialog")).getByRole("button", {
      name: "Close navigation",
    })).toHaveFocus();
  });

  it("keeps the desktop sidebar markup available", () => {
    renderShell();
    expect(screen.getByRole("complementary")).toHaveClass("md:block");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes and releases keyboard handling when the viewport becomes desktop", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    act(() => {
      desktopListener?.({ matches: true } as MediaQueryListEvent);
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    screen.getByRole("button", { name: "Background action" }).focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Background action" })).toHaveFocus();
    expect(desktopListener).toBeUndefined();
  });

  it("restores the exact body overflow value on unmount", () => {
    document.body.style.overflow = "clip";
    const rendered = renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(document.body.style.overflow).toBe("hidden");

    rendered.unmount();

    expect(document.body.style.overflow).toBe("clip");
    expect(desktopListener).toBeUndefined();
  });

  it("does not bounce focus to the trigger during Strict Mode effect cleanup", () => {
    render(
      <StrictMode>
        <ChatShell sidebar={<button type="button">Drawer action</button>}>
          <button type="button">Background action</button>
        </ChatShell>
      </StrictMode>
    );
    const trigger = screen.getByRole("button", { name: "Open navigation" });

    fireEvent.click(trigger);
    expect(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Close navigation",
      })
    ).toHaveFocus();
    expect(trigger).not.toHaveFocus();
  });
});
