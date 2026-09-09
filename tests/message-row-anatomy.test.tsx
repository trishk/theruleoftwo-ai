// @vitest-environment jsdom

import {
  render,
  screen,
  within,
} from "@testing-library/react";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import "@testing-library/jest-dom/vitest";

import { MessageList } from "@/components/chat/conversation/MessageList";
import type { ChatMessage } from "@/components/chat/conversation/types";
import {
  createAiParticipantIdentity,
  createHumanParticipantIdentity,
} from "@/lib/chat/participant-identity";

const noop = () => {};
const timestamp = new Date("2026-09-06T10:30:00.000Z");

function createMessage(
  id: number,
  overrides: Partial<ChatMessage>
): ChatMessage {
  return {
    id,
    authorType: "human",
    authorName: "Participant",
    content: `Contribution ${id}`,
    createdAt: timestamp,
    isOwnMessage: false,
    ...overrides,
  };
}

function renderMessages(messages: ChatMessage[]) {
  return render(
    <MessageList
      messages={messages}
      onReply={noop}
      onRetry={noop}
    />
  );
}

function anatomy(row: HTMLElement) {
  return Array.from(
    row.querySelectorAll<HTMLElement>("[data-message-part]")
  ).map((element) => element.dataset.messagePart);
}

describe("shared message row anatomy", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1)
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    Element.prototype.scrollTo = vi.fn();
  });

  it("uses identity, participant name, timestamp, then body or status for every human and AI participant", () => {
    const ownHuman = createHumanParticipantIdentity({
      id: "user-1",
      displayName: "Ada Lovelace",
      avatarUrl: null,
      currentUserId: "user-1",
    });
    const otherHuman = createHumanParticipantIdentity({
      id: "user-2",
      displayName: "Grace Hopper",
      avatarUrl: null,
      currentUserId: "user-1",
    });
    const participants: ChatMessage[] = [
      createMessage(1, {
        authorName: ownHuman.displayName,
        participant: ownHuman,
        isOwnMessage: true,
      }),
      createMessage(2, {
        authorName: otherHuman.displayName,
        participant: otherHuman,
      }),
      ...(["openai", "anthropic", "google", "future-provider"] as const).map(
        (provider, index) => {
          const participant = createAiParticipantIdentity(provider);
          return createMessage(index + 3, {
            authorType: "ai",
            authorName: participant.displayName,
            participant,
            provider,
            ...(provider === "future-provider"
              ? { content: "", isStreaming: true }
              : {}),
          });
        }
      ),
    ];

    renderMessages(participants);

    for (const participant of participants) {
      const row = screen.getByTestId(`message-${participant.id}`);
      expect(anatomy(row)).toEqual(
        participant.isStreaming && !participant.content
          ? ["identity", "name", "timestamp", "status"]
          : ["identity", "name", "timestamp", "body"]
      );
    }
  });

  it("aligns current-user rows right while other human and AI rows remain full-width", () => {
    const currentUser = createHumanParticipantIdentity({
      id: "user-1",
      displayName: "Ada Lovelace",
      avatarUrl: null,
      currentUserId: "user-1",
    });
    const otherHuman = createHumanParticipantIdentity({
      id: "user-2",
      displayName: "Grace Hopper",
      avatarUrl: null,
      currentUserId: "user-1",
    });
    const ai = createAiParticipantIdentity("openai");
    renderMessages([
      createMessage(1, {
        authorName: currentUser.displayName,
        participant: currentUser,
        isOwnMessage: true,
        content: `Long contribution ${"segment".repeat(50)}`,
      }),
      createMessage(2, {
        authorName: otherHuman.displayName,
        participant: otherHuman,
      }),
      createMessage(3, {
        authorType: "ai",
        authorName: ai.displayName,
        participant: ai,
        provider: "openai",
      }),
    ]);

    const ownRow = screen.getByTestId("message-1");
    expect(within(ownRow).getByText("You")).toBeInTheDocument();
    expect(ownRow.className).toContain("ml-auto");
    expect(ownRow.className).toContain("w-fit");
    expect(ownRow.className).toContain("max-w-[85%]");
    expect(ownRow.className).toContain("bg-muted/20");
    expect(ownRow.className).toContain("text-left");
    expect(ownRow.innerHTML).not.toContain("bg-[#2563EB]");
    expect(ownRow).toHaveAttribute("data-current-user", "true");
    expect(
      ownRow.querySelector('[data-message-part="body"]')
    ).toHaveClass("[overflow-wrap:anywhere]");

    for (const id of [2, 3]) {
      const row = screen.getByTestId(`message-${id}`);
      expect(row.className).not.toContain("ml-auto");
      expect(row.className).toContain("w-full");
      expect(row).toHaveAttribute("data-current-user", "false");
    }
  });

  it("uses current-user identity rather than matching the author name", () => {
    const currentUser = createHumanParticipantIdentity({
      id: "user-1",
      displayName: "Same Name",
      avatarUrl: null,
      currentUserId: "user-1",
    });
    const namesake = createHumanParticipantIdentity({
      id: "user-2",
      displayName: "Same Name",
      avatarUrl: null,
      currentUserId: "user-1",
    });

    renderMessages([
      createMessage(10, {
        authorName: "Different legacy name",
        participant: currentUser,
      }),
      createMessage(11, {
        authorName: currentUser.displayName,
        participant: namesake,
      }),
    ]);

    expect(screen.getByTestId("message-10").className).toContain("ml-auto");
    expect(screen.getByTestId("message-10").className).toContain("w-fit");
    expect(screen.getByTestId("message-11").className).toContain("w-full");
    expect(screen.getByTestId("message-10")).toHaveTextContent("You");
  });

  it("right-aligns an optimistic current-user row with stable identity and status", () => {
    renderMessages([
      createMessage(-101, {
        authorName: "You",
        isOwnMessage: true,
        timelineKey: "human:temporary:-101",
      }),
    ]);

    const row = screen.getByTestId("message--101");
    expect(row).toHaveAttribute("data-current-user", "true");
    expect(row.className).toContain("ml-auto");
    expect(row.className).toContain("w-fit");
    expect(row.className).toContain("max-w-[85%]");
    expect(row.className).toContain("text-left");
    expect(
      row.querySelector('[data-message-part="identity"]')
    ).toHaveTextContent("Y");
    expect(anatomy(row)).toEqual([
      "identity",
      "name",
      "timestamp",
      "body",
      "status",
    ]);
    expect(within(row).getByRole("status")).toHaveTextContent("Sending…");
  });

  it("renders deterministic human initials when no avatar exists", () => {
    const participant = createHumanParticipantIdentity({
      id: "user-2",
      displayName: "Grace Hopper",
      avatarUrl: null,
      currentUserId: "user-1",
    });
    renderMessages([
      createMessage(2, {
        authorName: participant.displayName,
        participant,
      }),
    ]);

    const identity = screen
      .getByTestId("message-2")
      .querySelector('[data-message-part="identity"]');
    expect(identity).toHaveTextContent("GH");
  });

  it("uses an existing safe avatar decoratively and falls back for unsafe URLs", () => {
    const safeParticipant = createHumanParticipantIdentity({
      id: "user-2",
      displayName: "Grace Hopper",
      avatarUrl: "https://images.example.test/grace.png",
      currentUserId: "user-1",
    });
    const unsafeParticipant = createHumanParticipantIdentity({
      id: "user-3",
      displayName: "Katherine Johnson",
      avatarUrl: "javascript:alert(1)",
      currentUserId: "user-1",
    });
    renderMessages([
      createMessage(2, {
        authorName: safeParticipant.displayName,
        participant: safeParticipant,
      }),
      createMessage(3, {
        authorName: unsafeParticipant.displayName,
        participant: unsafeParticipant,
      }),
    ]);

    const safeAvatar = screen
      .getByTestId("message-2")
      .querySelector("img");
    expect(safeAvatar).toHaveAttribute(
      "src",
      "https://images.example.test/grace.png"
    );
    expect(safeAvatar).toHaveAttribute("alt", "");
    expect(safeAvatar).toHaveAttribute(
      "referrerpolicy",
      "no-referrer"
    );
    expect(
      screen.getByTestId("message-3")
    ).toHaveTextContent("KJ");
  });

  it("selects AI identity and decorative icon from explicit provider ID rather than display-name matching", () => {
    renderMessages([
      createMessage(4, {
        authorType: "ai",
        authorName: "Claude",
        participant: createAiParticipantIdentity("anthropic"),
        provider: "openai",
      }),
    ]);

    const row = screen.getByTestId("message-4");
    expect(
      row.querySelector('[data-message-part="name"]')
    ).toHaveTextContent("ChatGPT");
    expect(row.querySelector("img")?.getAttribute("src")).toContain(
      "openai.svg"
    );
    const providerIcon = row.querySelector("img");
    expect(providerIcon).toHaveAttribute("alt", "");
    expect(providerIcon).toHaveClass("dark:invert");
    expect(providerIcon).not.toHaveClass("invert");
    expect(row.querySelector('[data-provider-accent="openai"]')).toBeInTheDocument();
    expect(within(row).getAllByText("ChatGPT")).toHaveLength(1);
    expect(
      within(row).getByRole("button", {
        name: "Reply to ChatGPT",
      })
    ).toBeInTheDocument();
    expect(
      within(row).queryByRole("button", {
        name: "Reply to Claude",
      })
    ).not.toBeInTheDocument();
  });

  it("uses a neutral named fallback for an unknown explicit provider", () => {
    renderMessages([
      createMessage(5, {
        authorType: "ai",
        authorName: "A branded-looking name",
        provider: "future-provider",
      }),
    ]);

    const row = screen.getByTestId("message-5");
    expect(
      row.querySelector('[data-message-part="name"]')
    ).toHaveTextContent("future-provider");
    expect(
      row.querySelector('[data-message-part="identity"]')
    ).toHaveTextContent("AI");
    expect(row.querySelector("[data-provider-accent]")).not.toBeInTheDocument();
    expect(
      within(row).getByRole("button", {
        name: "Reply to future-provider",
      })
    ).toBeInTheDocument();
  });

  it("uses a neutral fallback when an AI message has no provider", () => {
    renderMessages([
      createMessage(6, {
        authorType: "ai",
        authorName: "Legacy AI name",
      }),
    ]);

    const row = screen.getByTestId("message-6");
    expect(
      row.querySelector('[data-message-part="name"]')
    ).toHaveTextContent("Unknown AI");
    expect(
      row.querySelector('[data-message-part="identity"]')
    ).toHaveTextContent("AI");
    expect(row.querySelector("[data-provider-accent]")).not.toBeInTheDocument();
  });

  it("keeps current-user identity stable when an optimistic row reconciles", () => {
    const timelineKey = "temporary:-7";
    const rendered = renderMessages([
      createMessage(-7, {
        authorName: "You",
        isOwnMessage: true,
        timelineKey,
      }),
    ]);

    const optimisticRow = screen.getByTestId("message--7");
    const optimisticRowNode = optimisticRow;
    expect(optimisticRow.className).toContain("ml-auto");
    expect(optimisticRow.className).toContain("w-fit");
    expect(optimisticRow.className).toContain("max-w-[85%]");
    expect(
      optimisticRow.querySelector('[data-message-part="identity"]')
    ).toHaveTextContent("Y");
    expect(
      optimisticRow.querySelector('[data-message-part="name"]')
    ).toHaveTextContent("You");

    const participant = createHumanParticipantIdentity({
      id: "user-1",
      displayName: "Ada Lovelace",
      avatarUrl: "https://images.example.test/ada.png",
      currentUserId: "user-1",
    });

    rendered.rerender(
      <MessageList
        messages={[
          createMessage(7, {
            authorName: participant.displayName,
            participant,
            isOwnMessage: true,
            timelineKey,
          }),
        ]}
        onReply={noop}
        onRetry={noop}
      />
    );

    const persistedRow = screen.getByTestId("message-7");
    expect(persistedRow).toBe(optimisticRowNode);
    expect(persistedRow.className).toContain("ml-auto");
    expect(persistedRow.className).toContain("w-fit");
    expect(persistedRow.className).toContain("max-w-[85%]");
    expect(
      persistedRow.querySelector('[data-message-part="identity"]')
    ).toHaveTextContent("Y");
    expect(persistedRow.querySelector("img")).not.toBeInTheDocument();
    expect(
      persistedRow.querySelector('[data-message-part="name"]')
    ).toHaveTextContent("You");
  });
});
