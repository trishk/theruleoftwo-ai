// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@testing-library/jest-dom/vitest";

const { pathnameMock } = vi.hoisted(() => ({
  pathnameMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: pathnameMock,
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/actions", () => ({
  deleteConversation: vi.fn(),
  renameConversation: vi.fn(),
}));

vi.mock("@/components/chat/realtime/RealtimeConversationSync", () => ({
  useOptionalConversationRealtime: () => null,
}));

vi.mock("@/components/chat/realtime/RealtimeSidebarSync", () => ({
  useOptionalSidebarRealtime: () => null,
}));

import { ChatItem } from "@/components/chat/navigation/ChatItem";
import type { ConversationSummary } from "@/lib/chat/conversation-summary";

function chat(
  overrides: Partial<ConversationSummary> = {}
): ConversationSummary {
  return {
    id: 1,
    publicId: "conversation-1",
    title: "Design review",
    ownerId: "user-1",
    participants: [],
    humanCount: 1,
    aiCount: 0,
    participantCount: 1,
    conversationType: "human-1:1",
    latestMessageAuthor: null,
    latestMessagePreview: null,
    hasUnread: false,
    ...overrides,
  };
}

describe("ChatItem", () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue("/");
  });

  it("renders a read human conversation with metadata and empty fallback", () => {
    render(<ChatItem chat={chat()} currentUserId="user-1" />);

    expect(screen.getByRole("link", { name: "Design review" })).toHaveAttribute(
      "href",
      "/chat/conversation-1"
    );
    expect(screen.queryByLabelText("Human conversation")).not.toBeInTheDocument();
    expect(screen.getByText("1 participant · 0 AI")).toBeInTheDocument();
    expect(screen.getByText("No messages yet")).toHaveClass("truncate");
    expect(screen.queryByLabelText("Unread messages")).not.toBeInTheDocument();
  });

  it("renders normalized author preview and an accessible unread state", () => {
    render(
      <ChatItem
        chat={chat({
          humanCount: 2,
          aiCount: 1,
          participantCount: 3,
          conversationType: "mixed-or-multi-ai-group",
          latestMessageAuthor: {
            id: "ai:openai",
            displayName: "ChatGPT",
            type: "ai",
            providerId: "openai",
            avatarUrl: null,
            initials: "CH",
            isCurrentUser: false,
          },
          latestMessagePreview: "  First line\n  second   line 🌍  ",
          hasUnread: true,
        })}
        currentUserId="user-1"
      />
    );

    expect(
      screen.getByRole("link", { name: "Design review, unread messages" })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Mixed conversation")).not.toBeInTheDocument();
    expect(screen.getByText("3 participants · 1 AI")).toBeInTheDocument();
    expect(
      screen.getByText("ChatGPT: First line second line 🌍")
    ).toHaveClass("truncate", "font-medium");
    expect(screen.queryByLabelText("Unread messages")).not.toBeInTheDocument();
  });

  it("suppresses unread decoration for the active conversation", () => {
    pathnameMock.mockReturnValue("/chat/conversation-1");

    render(
      <ChatItem
        chat={chat({ hasUnread: true })}
        currentUserId="user-1"
      />
    );

    expect(screen.getByRole("link", { name: "Design review" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Unread messages")).not.toBeInTheDocument();
  });

  it("keeps the existing owner menu accessible", () => {
    render(<ChatItem chat={chat()} currentUserId="user-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Chat options" }));

    expect(screen.getByRole("button", { name: "Rename" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });
});
