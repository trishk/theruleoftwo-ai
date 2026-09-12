// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/current",
}));
vi.mock("@/app/actions", () => ({
  createChat: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@/components/chat/navigation/ChatList", () => ({
  ChatList: () => <div>Chat list</div>,
}));

import { ChatShell } from "@/components/chat/navigation/ChatShell";
import { ChatSidebar } from "@/components/chat/navigation/ChatSidebar";

describe("sidebar theme synchronization", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.add("dark");
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
  });

  it("keeps drawer and desktop toggles synchronized without losing the next desktop click", () => {
    render(
      <ChatShell sidebar={<ChatSidebar chats={[]} currentUserId="user-1" canAccessSettings />}>
        <div>Conversation</div>
      </ChatShell>
    );

    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const drawer = screen.getByRole("dialog", { name: "Navigation menu" });
    const drawerToggle = within(drawer).getByRole("button", {
      name: "Switch to light mode",
    });

    fireEvent.click(drawerToggle);

    const synchronizedToggles = screen.getAllByRole("button", {
      name: "Switch to dark mode",
    });
    expect(synchronizedToggles).toHaveLength(2);
    expect(synchronizedToggles[0]).toHaveAttribute("title", "Switch to dark mode");
    expect(synchronizedToggles[1]).toHaveAttribute("title", "Switch to dark mode");
    expect(document.documentElement).not.toHaveClass("dark");

    fireEvent.click(within(drawer).getByRole("button", { name: "Close navigation" }));
    const desktopToggle = screen.getByRole("button", { name: "Switch to dark mode" });
    fireEvent.click(desktopToggle);

    expect(document.documentElement).toHaveClass("dark");
    expect(desktopToggle).toHaveAccessibleName("Switch to light mode");
    expect(desktopToggle).toHaveAttribute("title", "Switch to light mode");
  });
});
