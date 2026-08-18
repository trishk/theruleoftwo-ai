// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import "@testing-library/jest-dom/vitest";

vi.mock("@/app/actions", () => ({
  createChat: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/components/chat/navigation/ChatList", () => ({
  ChatList: () => <div>Chat list</div>,
}));

vi.mock("@/components/chat/navigation/ThemeToggle", () => ({
  ThemeToggle: () => <button>Theme</button>,
}));

import { ChatSidebar } from "@/components/chat/navigation/ChatSidebar";

describe("ChatSidebar", () => {
  it("shows owner navigation controls for a regular user", () => {
    render(
      <ChatSidebar
        chats={[]}
        currentUserId="user-1"
      />
    );

    expect(
      screen.getByRole("button", {
        name: "New chat",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByRole("link", {
        name: "Settings",
      })
    ).toHaveAttribute(
      "href",
      "/settings"
    );

    expect(
      screen.getByRole("button", {
        name: "Sign out",
      })
    ).toBeInTheDocument();

    expect(
      screen.getByText("Recent")
    ).toBeInTheDocument();
  });

  it("hides owner navigation controls from guests", () => {
    render(
      <ChatSidebar
        chats={[]}
        currentUserId="guest-1"
        isGuest
      />
    );

    expect(
      screen.queryByRole("button", {
        name: "New chat",
      })
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole("link", {
        name: "Settings",
      })
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole("button", {
        name: "Sign out",
      })
    ).not.toBeInTheDocument();

    expect(
      screen.getByText("Conversations")
    ).toBeInTheDocument();
  });
});