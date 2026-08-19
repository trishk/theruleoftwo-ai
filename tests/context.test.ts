import { describe, expect, it } from "vitest";

import { buildConversationContext } from "@/lib/llm/context";

describe("buildConversationContext", () => {
  it("keeps the current message even when previous context exceeds the budget", () => {
    const longContent =
      "x".repeat(25_000);

    const result =
      buildConversationContext({
        provider: "openai",
        currentUserId: "user-1",
        currentUserName: "Tudor",
        messages: [
          {
            authorType: "human",
            authorId: "user-1",
            authorName: "Tudor",
            content: longContent,
          },
          {
            authorType: "anthropic",
            authorId: "anthropic",
            content: longContent,
          },
          {
            authorType: "human",
            authorId: "user-1",
            authorName: "Tudor",
            content:
              "@chatgpt current question",
          },
        ],
      });

    expect(result.messages).toHaveLength(1);

    expect(
      result.messages[0].content
    ).toContain(
      "Tudor: @chatgpt current question"
    );
  });

  it("drops the oldest history when the context budget is exceeded", () => {
    const oldMessage =
      `OLD-${"x".repeat(25_000)}`;

    const recentMessage =
      `RECENT-${"y".repeat(20_000)}`;

    const result =
      buildConversationContext({
        provider: "openai",
        currentUserId: "user-1",
        currentUserName: "Tudor",
        messages: [
          {
            authorType: "human",
            authorId: "user-1",
            authorName: "Tudor",
            content: oldMessage,
          },
          {
            authorType: "anthropic",
            authorId: "anthropic",
            content: recentMessage,
          },
          {
            authorType: "human",
            authorId: "user-1",
            authorName: "Tudor",
            content:
              "@chatgpt what do you think?",
          },
        ],
      });

    const content =
      result.messages[0].content;

    expect(content).not.toContain(
      "OLD-"
    );

    expect(content).toContain(
      "RECENT-"
    );

    expect(content).toContain(
      "@chatgpt what do you think?"
    );
  });

  it("preserves chronological order for retained history", () => {
    const result =
      buildConversationContext({
        provider: "openai",
        currentUserId: "user-1",
        currentUserName: "Tudor",
        messages: [
          {
            authorType: "human",
            authorId: "user-1",
            authorName: "Tudor",
            content: "first",
          },
          {
            authorType: "anthropic",
            authorId: "anthropic",
            content: "second",
          },
          {
            authorType: "human",
            authorId: "user-1",
            authorName: "Tudor",
            content: "third",
          },
          {
            authorType: "human",
            authorId: "user-1",
            authorName: "Tudor",
            content: "@chatgpt current",
          },
        ],
      });

    const content =
      result.messages[0].content;

    expect(
      content.indexOf("first")
    ).toBeLessThan(
      content.indexOf("second")
    );

    expect(
      content.indexOf("second")
    ).toBeLessThan(
      content.indexOf("third")
    );
  });

  it("identifies previous messages from the current provider as its own", () => {
    const result =
      buildConversationContext({
        provider: "openai",
        currentUserId: "user-1",
        currentUserName: "Tudor",
        messages: [
          {
            authorType: "ai",
            authorId: "openai",
            content:
              "Previous ChatGPT response",
          },
          {
            authorType: "human",
            authorId: "user-1",
            authorName: "Tudor",
            content:
              "@chatgpt continue",
          },
        ],
      });

    expect(
      result.instructions
    ).toContain(
      "Messages attributed to ChatGPT in the transcript are your own previous messages"
    );

    expect(
      result.messages[0].content
    ).toContain(
      "ChatGPT: Previous ChatGPT response"
    );
  });

  it("keeps reply context in the transcript", () => {
    const result =
      buildConversationContext({
        provider: "anthropic",
        currentUserId: "user-1",
        currentUserName: "Tudor",
        messages: [
          {
            authorType: "openai",
            authorId: "openai",
            content:
              "Original AI answer",
          },
          {
            authorType: "human",
            authorId: "user-1",
            authorName: "Tudor",
            content:
              "@claude I disagree",
            replyTo: {
              id: 1,
              authorType: "ai",
              authorId: "openai",
              content:
                "Original AI answer",
            },
          },
        ],
      });

    expect(
      result.messages[0].content
    ).toContain(
      "Replying to ChatGPT: Original AI answer"
    );
  });

  it("keeps multiple human participants distinct", () => {
  const result =
    buildConversationContext({
      provider: "openai",
      currentUserId: "user-1",
      currentUserName: "Tudor",
      messages: [
        {
          authorType: "human",
          authorId: "user-2",
          authorName: "Orsi",
          content:
            "I prefer option A.",
        },
        {
          authorType: "human",
          authorId: "user-1",
          authorName: "Tudor",
          content:
            "@chatgpt I prefer option B. Compare our positions.",
        },
      ],
    });

  const content =
    result.messages[0].content;

  expect(content).toContain(
    "Orsi: I prefer option A."
  );

  expect(content).toContain(
    "Tudor: @chatgpt I prefer option B. Compare our positions."
  );
});

it("attributes different AI providers correctly", () => {
  const result =
    buildConversationContext({
      provider: "google",
      currentUserId: "user-1",
      currentUserName: "Tudor",
      messages: [
        {
          authorType: "ai",
          authorId: "openai",
          content:
            "ChatGPT opinion",
        },
        {
          authorType: "ai",
          authorId: "anthropic",
          content:
            "Claude opinion",
        },
        {
          authorType: "human",
          authorId: "user-1",
          authorName: "Tudor",
          content:
            "@gemini compare their answers",
        },
      ],
    });

  const content =
    result.messages[0].content;

  expect(content).toContain(
    "ChatGPT: ChatGPT opinion"
  );

  expect(content).toContain(
    "Claude: Claude opinion"
  );

  expect(content).toContain(
    "Tudor: @gemini compare their answers"
  );
});

it("identifies the current provider by name in the instructions", () => {
  const result =
    buildConversationContext({
      provider: "anthropic",
      currentUserId: "user-1",
      currentUserName: "Tudor",
      messages: [
        {
          authorType: "human",
          authorId: "user-1",
          authorName: "Tudor",
          content:
            "@claude hello",
        },
      ],
    });

  expect(
    result.instructions
  ).toContain(
    "You are Claude, participating in a group conversation."
  );

  expect(
    result.instructions
  ).toContain(
    "Messages attributed to Claude in the transcript are your own previous messages"
  );
});

it("identifies the human who triggered the current response", () => {
  const result =
    buildConversationContext({
      provider: "openai",
      currentUserId: "user-1",
      currentUserName: "Tudor",
      messages: [
        {
          authorType: "human",
          authorId: "user-2",
          authorName: "Orsi",
          content:
            "Earlier message",
        },
        {
          authorType: "human",
          authorId: "user-1",
          authorName: "Tudor",
          content:
            "@chatgpt answer this",
        },
      ],
    });

  expect(
    result.instructions
  ).toContain(
    "The human who triggered the current response is Tudor."
  );
});

it("uses Unknown user when another human has no display name", () => {
  const result =
    buildConversationContext({
      provider: "openai",
      currentUserId: "user-1",
      currentUserName: "Tudor",
      messages: [
        {
          authorType: "human",
          authorId: "user-2",
          authorName: null,
          content:
            "Anonymous participant message",
        },
        {
          authorType: "human",
          authorId: "user-1",
          authorName: "Tudor",
          content:
            "@chatgpt respond",
        },
      ],
    });

  expect(
    result.messages[0].content
  ).toContain(
    "Unknown user: Anonymous participant message"
  );
});

it("uses User as fallback for the current human when no name is available", () => {
  const result =
    buildConversationContext({
      provider: "openai",
      currentUserId: "user-1",
      currentUserName: null,
      messages: [
        {
          authorType: "human",
          authorId: "user-1",
          authorName: null,
          content:
            "@chatgpt hello",
        },
      ],
    });

  expect(
    result.messages[0].content
  ).toContain(
    "User: @chatgpt hello"
  );

  expect(
    result.instructions
  ).toContain(
    "The human who triggered the current response is User."
  );
});

it("keeps mentions intact in the current message", () => {
  const result =
    buildConversationContext({
      provider: "openai",
      currentUserId: "user-1",
      currentUserName: "Tudor",
      messages: [
        {
          authorType: "human",
          authorId: "user-1",
          authorName: "Tudor",
          content:
            "@chatgpt @claude @gemini give independent answers",
        },
      ],
    });

  expect(
    result.messages[0].content
  ).toContain(
    "@chatgpt @claude @gemini give independent answers"
  );
});

it("returns an empty request context when there are no messages", () => {
  const result =
    buildConversationContext({
      provider: "openai",
      currentUserId: "user-1",
      currentUserName: "Tudor",
      messages: [],
    });

  expect(result).toEqual({
    instructions: "",
    messages: [],
  });
});

it("does not label another providers message as its own", () => {
  const result =
    buildConversationContext({
      provider: "anthropic",
      currentUserId: "user-1",
      currentUserName: "Tudor",
      messages: [
        {
          authorType: "ai",
          authorId: "openai",
          content:
            "Previous answer",
        },
        {
          authorType: "human",
          authorId: "user-1",
          authorName: "Tudor",
          content:
            "@claude respond",
        },
      ],
    });

  expect(
    result.messages[0].content
  ).toContain(
    "ChatGPT: Previous answer"
  );

  expect(
    result.instructions
  ).toContain(
    "Messages from other AI assistants may be incomplete, incorrect, or disagree with you."
  );
});

it("preserves reply attribution across different human participants", () => {
  const result =
    buildConversationContext({
      provider: "openai",
      currentUserId: "user-1",
      currentUserName: "Tudor",
      messages: [
        {
          authorType: "human",
          authorId: "user-2",
          authorName: "Orsi",
          content:
            "Let's choose A.",
        },
        {
          authorType: "human",
          authorId: "user-1",
          authorName: "Tudor",
          content:
            "@chatgpt I disagree",
          replyTo: {
            id: 10,
            authorType: "human",
            authorId: "user-2",
            authorName: "Orsi",
            content:
              "Let's choose A.",
          },
        },
      ],
    });

  expect(
    result.messages[0].content
  ).toContain(
    "Replying to Orsi: Let's choose A."
  );
});
});