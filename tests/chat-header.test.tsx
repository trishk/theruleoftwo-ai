// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import "@testing-library/jest-dom/vitest";

vi.mock("@/app/actions", () => ({
  createConversationInvite: vi.fn(),
  renameConversation: vi.fn(),
}));

vi.mock("@/components/chat/realtime/RealtimeConversationSync", () => ({
  useOptionalConversationRealtime: () => null,
}));

vi.mock("@/components/chat/navigation/LeaveConversationButton", () => ({
  LeaveConversationButton: () => <button>Leave conversation</button>,
}));

import { ChatHeader } from "@/components/chat/navigation/ChatHeader";
import { ConversationTypeIcon } from "@/components/chat/navigation/ConversationTypeIcon";
import type { ConversationSummary } from "@/lib/chat/conversation-summary";

function summary(
  overrides: Partial<ConversationSummary> = {}
): ConversationSummary {
  return {
    id: 1,
    publicId: "conversation-1",
    title: "Decision",
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

describe("ChatHeader", () => {
  it("renders safely without conversation props", () => {
    render(<ChatHeader />);

    expect(screen.getByText("Conversation")).toBeInTheDocument();
    expect(screen.queryByLabelText(/conversation$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/participant/)).not.toBeInTheDocument();
  });

  it("uses shared human-only metadata", () => {
    render(
      <ChatHeader
        conversationId={1}
        title="Decision"
        summary={summary()}
      />
    );

    expect(screen.getByLabelText("Human conversation")).toBeInTheDocument();
    expect(screen.getByText("1 participant · 0 AI")).toBeInTheDocument();
  });

  it("renders semantic human-group iconography", () => {
    render(
      <ChatHeader
        conversationId={1}
        title="Human team"
        summary={summary({
          humanCount: 3,
          participantCount: 3,
          conversationType: "human-group",
        })}
      />
    );

    expect(screen.getByLabelText("Human group conversation")).toBeInTheDocument();
    expect(screen.getByText("3 participants · 0 AI")).toBeInTheDocument();
  });

  it("distinguishes multi-AI from mixed-group iconography", () => {
    const { rerender } = render(
      <ChatHeader
        conversationId={1}
        title="AI panel"
        summary={summary({
          humanCount: 1,
          aiCount: 2,
          participantCount: 3,
          conversationType: "mixed-or-multi-ai-group",
        })}
      />
    );

    expect(screen.getByLabelText("Multi-AI conversation")).toBeInTheDocument();
    expect(screen.getByText("3 participants · 2 AI")).toBeInTheDocument();

    rerender(
      <ChatHeader
        conversationId={1}
        title="Team decision"
        summary={summary({
          humanCount: 2,
          aiCount: 2,
          participantCount: 4,
          conversationType: "mixed-or-multi-ai-group",
        })}
      />
    );

    expect(screen.getByLabelText("Mixed conversation")).toBeInTheDocument();
    expect(screen.queryByLabelText("Multi-AI conversation")).not.toBeInTheDocument();
  });

  it("uses mixed-group iconography and the same metadata", () => {
    render(
      <ChatHeader
        conversationId={1}
        title="Team decision"
        summary={summary({
          humanCount: 2,
          aiCount: 2,
          participantCount: 4,
          conversationType: "mixed-or-multi-ai-group",
        })}
      />
    );

    expect(screen.getByLabelText("Mixed conversation")).toBeInTheDocument();
    expect(screen.getByText("4 participants · 2 AI")).toBeInTheDocument();
  });

  it("preserves title rename affordance and owner invite", () => {
    render(
      <ChatHeader
        conversationId={1}
        title="Editable title"
        isOwner
        summary={summary()}
      />
    );

    expect(screen.getByRole("button", { name: "Invite" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Editable title" }));

    expect(screen.getByRole("textbox")).toHaveValue("Editable title");
  });

  it("preserves the guest leave action", () => {
    render(
      <ChatHeader
        conversationId={1}
        title="Guest chat"
        isGuest
        summary={summary()}
      />
    );

    expect(
      screen.getByRole("button", { name: "Leave conversation" })
    ).toBeInTheDocument();
  });

  it("uses a generic Bot safely for an AI one-to-one conversation", () => {
    render(
      <ChatHeader
        conversationId={1}
        title="Unknown AI"
        summary={summary({
          aiCount: 1,
          participantCount: 2,
          conversationType: "ai-1:1",
        })}
      />
    );

    expect(screen.getByLabelText("AI conversation")).toBeInTheDocument();
  });

  it("lets caller sizing override the icon defaults", () => {
    render(
      <ConversationTypeIcon
        kind="human"
        label="Human conversation"
        className="h-7 w-7"
      />
    );

    expect(screen.getByLabelText("Human conversation")).toHaveClass("h-7", "w-7");
    expect(screen.getByLabelText("Human conversation")).not.toHaveClass("h-8", "w-8");
  });
});
