import { PROVIDER_META } from "@/lib/llm/providerMeta";
import type { Provider } from "@/lib/llm/types";

export type HumanParticipantIdentity = {
  id: string;
  displayName: string;
  type: "human";
  avatarUrl: string | null;
  initials: string;
  isCurrentUser: boolean;
};

export type AiParticipantIdentity = {
  id: `ai:${string}`;
  displayName: string;
  type: "ai";
  providerId: string;
  avatarUrl: null;
  initials: string;
  isCurrentUser: false;
};

export type ParticipantIdentity =
  | HumanParticipantIdentity
  | AiParticipantIdentity;

export function getParticipantInitials(displayName: string): string {
  const words = displayName.match(/[\p{L}\p{N}]+/gu) ?? [];

  if (words.length === 0) {
    return "?";
  }

  if (words.length === 1) {
    return words[0]!.slice(0, 2).toLocaleUpperCase();
  }

  return `${words[0]![0]}${words.at(-1)?.[0] ?? ""}`.toLocaleUpperCase();
}

export function createHumanParticipantIdentity({
  id,
  displayName,
  avatarUrl,
  currentUserId,
}: {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  currentUserId: string;
}): HumanParticipantIdentity {
  const resolvedDisplayName = displayName?.trim() || "Unknown user";

  return {
    id,
    displayName: resolvedDisplayName,
    type: "human",
    avatarUrl,
    initials: getParticipantInitials(resolvedDisplayName),
    isCurrentUser: id === currentUserId,
  };
}

export function isKnownProvider(providerId: string): providerId is Provider {
  return Object.prototype.hasOwnProperty.call(PROVIDER_META, providerId);
}

export function createAiParticipantIdentity(
  providerId: string
): AiParticipantIdentity {
  const displayName = isKnownProvider(providerId)
    ? PROVIDER_META[providerId].name
    : providerId;

  return {
    id: `ai:${providerId}`,
    displayName,
    type: "ai",
    providerId,
    avatarUrl: null,
    initials: getParticipantInitials(displayName),
    isCurrentUser: false,
  };
}
