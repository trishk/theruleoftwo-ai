// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import "@testing-library/jest-dom/vitest";

vi.mock("@/app/actions", () => ({
  createConversationInvite: vi.fn(),
  renameConversation: vi.fn(),
  revokeConversationInvite: vi.fn(),
  updateMemberAiUsage: vi.fn(),
}));

vi.mock("@/components/chat/realtime/RealtimeConversationSync", () => ({
  useOptionalConversationRealtime: () => null,
}));

vi.mock("@/components/chat/navigation/LeaveConversationButton", () => ({
  LeaveConversationButton: () => <button>Leave conversation</button>,
}));

import { ChatHeader } from "@/components/chat/navigation/ChatHeader";
import { renameConversation, updateMemberAiUsage } from "@/app/actions";
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
  it("keeps mobile actions behind one accessible trigger and restores focus on Escape", () => {
    render(<ChatHeader conversationId={1} isOwner summary={summary()} />);
    const trigger = screen.getByRole("button", { name: "Conversation actions" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu", { name: "Conversation actions" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /AI sharing/i })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Conversation actions" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("keeps Usage & Cost mounted after launching it from the mobile menu", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ breakdown: [] }) })));
    const usage = { knownEstimatedCost: "$0.01", knownAttemptCount: 1, unknownAttemptCount: 0, pendingAttemptCount: 0, legacyAttemptCount: 0, providerInvokedAttemptCount: 1 };
    render(<ChatHeader conversationId={1} isOwner summary={summary()} usageSummary={usage} />);
    fireEvent.click(screen.getByRole("button", { name: "Conversation actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Usage & Cost" }));
    expect(screen.queryByRole("menu", { name: "Conversation actions" })).not.toBeInTheDocument();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /close usage and cost dialog/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    vi.unstubAllGlobals();
  });

  it("dismisses the mobile menu and exposes a failed action", async () => {
    vi.mocked(updateMemberAiUsage).mockRejectedValueOnce(new Error("no"));
    render(<ChatHeader conversationId={1} isOwner summary={summary()} />);
    fireEvent.click(screen.getByRole("button", { name: "Conversation actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /AI sharing/i }));
    expect(screen.queryByRole("menu", { name: "Conversation actions" })).not.toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not change AI sharing/i);
  });

  it("clears a failed rename error when editing is cancelled", async () => {
    vi.mocked(renameConversation).mockRejectedValueOnce(new Error("no"));
    render(<ChatHeader conversationId={1} title="Original" isOwner summary={summary()} />);
    fireEvent.click(screen.getByRole("button", { name: "Original" }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Changed" } });
    fireEvent.blur(input);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
  it("shows usage only to owners with attempts", () => {
    const usage = { knownEstimatedCost: "$0.01", knownAttemptCount: 1, unknownAttemptCount: 0, pendingAttemptCount: 0, legacyAttemptCount: 0, providerInvokedAttemptCount: 1 };
    const { rerender } = render(<ChatHeader conversationId={1} isOwner usageSummary={usage} />);
    expect(screen.getByRole("button", { name: /estimated \$0\.01/i })).toBeInTheDocument();
    rerender(<ChatHeader conversationId={1} usageSummary={usage} />);
    expect(screen.queryByRole("button", { name: /estimated \$0\.01/i })).not.toBeInTheDocument();
    rerender(<ChatHeader conversationId={1} isOwner usageSummary={{ ...usage, knownAttemptCount: 0, providerInvokedAttemptCount: 0 }} />);
    expect(screen.queryByRole("button", { name: /estimated \$0\.01/i })).not.toBeInTheDocument();
  });
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

  it.each(["member", "guest"])(
    "shows the leave action for a non-owner %s",
    (role) => {
      render(
        <ChatHeader
          conversationId={1}
          title={`${role} chat`}
          summary={summary()}
        />
      );

      expect(
        screen.getByRole("button", { name: "Leave conversation" })
      ).toBeInTheDocument();
    }
  );

  it("does not show the leave action to the owner", () => {
    render(
      <ChatHeader
        conversationId={1}
        title="Owner chat"
        isOwner
        summary={summary()}
      />
    );

    expect(
      screen.queryByRole("button", { name: "Leave conversation" })
    ).not.toBeInTheDocument();
  });

  it("resynchronizes shared AI state when server props change", () => {
    const { rerender } = render(
      <ChatHeader
        conversationId={1}
        isOwner
        allowMemberAiUsage={false}
      />
    );

    expect(screen.getByText("AI sharing: Off")).toBeInTheDocument();

    rerender(
      <ChatHeader
        conversationId={1}
        isOwner
        allowMemberAiUsage
      />
    );
    expect(screen.getByText("AI sharing: On")).toBeInTheDocument();

    rerender(
      <ChatHeader
        conversationId={1}
        isOwner
        allowMemberAiUsage={false}
      />
    );
    expect(screen.getByText("AI sharing: Off")).toBeInTheDocument();
  });

  it("resynchronizes invite state after revocation and conversation changes", () => {
    const invite = {
      id: 5,
      token: "invite-token",
      usageCount: 3,
    };
    const { rerender } = render(
      <ChatHeader
        conversationId={1}
        isOwner
        activeInvite={invite}
      />
    );

    expect(screen.getByRole("button", { name: /revoke invite/i }))
      .toBeInTheDocument();

    rerender(
      <ChatHeader
        conversationId={1}
        isOwner
        activeInvite={null}
      />
    );
    expect(screen.queryByRole("button", { name: /revoke invite/i }))
      .not.toBeInTheDocument();

    rerender(
      <ChatHeader
        conversationId={2}
        isOwner
        allowMemberAiUsage
        activeInvite={{ id: 8, token: "next-token", usageCount: 1 }}
      />
    );
    expect(screen.getByText("AI sharing: On")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /9 uses remaining/i }))
      .toBeInTheDocument();
  });

  it("shows owner-only conversation controls and explains shared AI cost", () => {
    const { rerender } = render(
      <ChatHeader
        conversationId={1}
        title="Owner chat"
        isOwner
        summary={summary()}
      />
    );

    expect(screen.getByRole("button", { name: /enable shared AI usage/i }))
      .toBeInTheDocument();
    expect(screen.getByLabelText(/may cost you money/i)).toBeInTheDocument();

    rerender(
      <ChatHeader
        conversationId={1}
        title="Member chat"
        summary={summary()}
      />
    );

    expect(screen.queryByRole("button", { name: /shared AI usage/i }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invite" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Member chat" }))
      .not.toBeInTheDocument();
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
