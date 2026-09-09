import type {
  ConversationSummary,
} from "@/lib/chat/conversation-summary";

export type ConversationIconKind =
  | "human"
  | "human-group"
  | "ai"
  | "multi-ai"
  | "mixed-group";

type PresentationSummary = Pick<
  ConversationSummary,
  | "conversationType"
  | "humanCount"
  | "participantCount"
  | "aiCount"
  | "latestMessageAuthor"
  | "latestMessagePreview"
>;

export function getConversationIconKind(
  {
    conversationType,
    humanCount,
    aiCount,
  }: Pick<
    ConversationSummary,
    "conversationType" | "humanCount" | "aiCount"
  >
): ConversationIconKind {
  switch (conversationType) {
    case "human-1:1":
      return "human";
    case "human-group":
      return "human-group";
    case "ai-1:1":
      return "ai";
    case "mixed-or-multi-ai-group":
      return humanCount === 1 && aiCount >= 2
        ? "multi-ai"
        : "mixed-group";
  }
}

export function getConversationTypeLabel(
  iconKind: ConversationIconKind
): string {
  switch (iconKind) {
    case "human":
      return "Human conversation";
    case "human-group":
      return "Human group conversation";
    case "ai":
      return "AI conversation";
    case "multi-ai":
      return "Multi-AI conversation";
    case "mixed-group":
      return "Mixed conversation";
  }
}

export function formatConversationMetadata({
  participantCount,
  aiCount,
}: Pick<ConversationSummary, "participantCount" | "aiCount">): string {
  const participantLabel =
    participantCount === 1 ? "participant" : "participants";

  return `${participantCount} ${participantLabel} · ${aiCount} AI`;
}

export function normalizeConversationPreview(
  content: string | null
): string | null {
  const normalized = content?.replace(/\s+/gu, " ").trim() ?? "";

  return normalized || null;
}

export function formatConversationPreview({
  latestMessageAuthor,
  latestMessagePreview,
}: Pick<
  ConversationSummary,
  "latestMessageAuthor" | "latestMessagePreview"
>): string {
  const content = normalizeConversationPreview(latestMessagePreview);

  if (!content) {
    return "No messages yet";
  }

  const author = normalizeConversationPreview(
    latestMessageAuthor?.displayName ?? null
  );

  return author ? `${author}: ${content}` : content;
}

export function getConversationPresentation(
  summary: PresentationSummary
) {
  const iconKind = getConversationIconKind(summary);

  return {
    iconKind,
    typeLabel: getConversationTypeLabel(iconKind),
    metadataLabel: formatConversationMetadata(summary),
    preview: formatConversationPreview(summary),
  };
}
