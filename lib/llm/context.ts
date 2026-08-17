import type {
  LLMMessage,
  Provider,
} from "./types";
import { PROVIDER_META } from "./providerMeta";

type ContextReply = {
  id: number;
  authorType: string;
  authorId: string;
  authorName?: string | null;
  content: string;
};

type ContextMessage = {
  authorType: string;
  authorId: string;
  authorName?: string | null;
  content: string;
  replyTo?: ContextReply | null;
};

type BuildContextParams = {
  provider: Provider;
  messages: ContextMessage[];
  currentUserId: string;
  currentUserName?: string | null;
};

function getAuthorName(
  authorType: string,
  authorId: string,
  authorName?: string | null,
  currentUserId?: string,
  currentUserName?: string | null
) {
  if (authorType === "human") {
    if (
      currentUserId &&
      authorId === currentUserId
    ) {
      return (
        currentUserName ||
        authorName ||
        "User"
      );
    }

    return (
      authorName ||
      "Unknown user"
    );
  }

  if (
    authorId === "openai" ||
    authorId === "anthropic" ||
    authorId === "google"
  ) {
    return PROVIDER_META[
      authorId
    ].name;
  }

  return authorName || authorId;
}

function formatMessage(
  message: ContextMessage,
  currentUserId: string,
  currentUserName?: string | null
) {
  const authorName =
    getAuthorName(
      message.authorType,
      message.authorId,
      message.authorName,
      currentUserId,
      currentUserName
    );

  const parts = [
    `${authorName}: ${message.content}`,
  ];

  if (message.replyTo) {
    const replyAuthorName =
      getAuthorName(
        message.replyTo.authorType,
        message.replyTo.authorId,
        message.replyTo.authorName,
        currentUserId,
        currentUserName
      );

    parts.push(
      `Replying to ${replyAuthorName}: ${message.replyTo.content}`
    );
  }

  return parts.join("\n");
}

export function buildConversationContext({
  provider,
  messages,
  currentUserId,
  currentUserName,
}: BuildContextParams): {
  instructions: string;
  messages: LLMMessage[];
} {
  const providerName =
    PROVIDER_META[provider].name;

  const userName =
    currentUserName || "User";

  const currentMessage =
    messages.at(-1);

  if (!currentMessage) {
    return {
      instructions: "",
      messages: [],
    };
  }

  const previousMessages =
    messages.slice(0, -1);

  const transcript =
    previousMessages
      .map((message) =>
        formatMessage(
          message,
          currentUserId,
          currentUserName
        )
      )
      .join("\n\n");

  const currentContent =
    formatMessage(
      currentMessage,
      currentUserId,
      currentUserName
    );

  const systemMessage = [
    `You are ${providerName}, participating in a group conversation.`,
    `The human who triggered the current response is ${userName}.`,
    "The conversation may contain multiple human participants and multiple AI assistants.",
    "Each message in the transcript is explicitly attributed to its author.",
    "Human display names identify different human participants. Treat messages from different humans as coming from different people.",
    "Messages from other AI assistants are their statements, not yours.",
    "Human messages may address participants using @mentions such as @chatgpt, @claude, and @gemini.",
    "Treat @mentions as meaningful conversation context.",
    "If multiple AI participants are mentioned, each mentioned AI responds independently as itself.",
    "Words such as 'each', 'everyone', 'both', or 'you all' may refer to participants mentioned in that message.",
    "A message may include a 'Replying to' reference. Treat that reference as the specific message being replied to and use it to resolve otherwise ambiguous replies.",
    "Use the full conversation transcript as context when answering the current message.",
    "Respond only as yourself.",
    "Do not impersonate another participant.",
    "Do not automatically agree with other participants; provide your own independent assessment.",

    "Prioritize accuracy over completeness.",
    "Never fabricate facts, citations, statistics, sources, features, or capabilities.",
    "Treat information stated by human participants as provided conversation context.",
    "Do not require independent verification of user-provided context unless verification is relevant to the request.",
    "If required information is missing or uncertain, say so rather than guessing.",
    "Clearly flag information that may be time-sensitive or outdated when relevant.",

    "Treat this as a real-time group chat, not a report, article, or essay.",
    "For ordinary conversational questions, answer in 1-2 short paragraphs and no more than 80 words.",
    "For ordinary conversational questions, do not use headings, bullet lists, summaries, introductions, or conclusions.",
    "Do not repeat the question or restate context unless needed for clarity.",
    "Answer only what was asked and stop when the answer is complete.",
    "Use longer or structured responses only when the user explicitly asks for detail, analysis, comparison, steps, a list, or another format that requires it.",
    "Do not add speculative features, assumptions, generic caveats, or unsolicited next steps.",
  ].join(" ");

  const userMessage =
    transcript
      ? [
          "Conversation transcript:",
          "",
          transcript,
          "",
          "Current message:",
          currentContent,
        ].join("\n")
      : currentContent;

  return {
    instructions:
      systemMessage,
    messages: [
      {
        role: "user",
        content: userMessage,
      },
    ],
  };
}