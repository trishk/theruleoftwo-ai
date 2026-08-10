import type { LLMMessage, Provider } from "./types";
import { PROVIDER_META } from "./providerMeta";
import { stripMentions } from "./prompt";

type ContextMessage = {
  authorType: string;
  authorId: string;
  content: string;
};

type BuildContextParams = {
  provider: Provider;
  messages: ContextMessage[];
  currentUserId: string;
  currentUserName?: string | null;
};

function getAuthorName(
  message: ContextMessage,
  currentUserId: string,
  currentUserName?: string | null
) {
  if (message.authorType === "human") {
    if (message.authorId === currentUserId) {
      return currentUserName || "User";
    }

    return message.authorId;
  }

  if (
    message.authorId === "openai" ||
    message.authorId === "anthropic" ||
    message.authorId === "google"
  ) {
    return PROVIDER_META[message.authorId].name;
  }

  return message.authorId;
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
  const providerName = PROVIDER_META[provider].name;

  const currentMessage = messages.at(-1);

  if (!currentMessage) {
    return {
      instructions: "",
      messages: [],
    };
  }

  const previousMessages = messages.slice(0, -1);

  const transcript = previousMessages
    .map((message) => {
      const authorName = getAuthorName(
        message,
        currentUserId,
        currentUserName
      );

      const content =
        message.authorType === "human"
          ? stripMentions(message.content)
          : message.content;

      return `${authorName}: ${content}`;
    })
    .join("\n\n");

  const systemMessage = [
  `You are ${providerName}, participating in a group conversation.`,
  "The conversation may include humans and other AI assistants.",
  "Messages from other AI assistants are their statements, not yours.",
  "Use the conversation transcript as context when answering.",
  "Respond only as yourself.",
  "Do not automatically agree with other participants; provide your own independent assessment.",

  "Prioritize accuracy over completeness.",
  "Never fabricate facts, citations, statistics, sources, features, or capabilities.",
  "Treat information stated by human participants in the conversation as provided context; do not require independent verification unless verification is relevant to the question.",
  "If the answer is supported by the conversation context, answer directly.",
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

  const currentContent =
    currentMessage.authorType === "human"
      ? stripMentions(currentMessage.content)
      : currentMessage.content;

  const userMessage = transcript
    ? `Conversation transcript:\n\n${transcript}\n\nCurrent message:\n${currentContent}`
    : currentContent;

  return {
    instructions: systemMessage,
    messages: [
      {
        role: "user",
        content: userMessage,
      },
    ],
  };
}