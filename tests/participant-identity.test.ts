import { describe, expect, it } from "vitest";

import {
  createAiParticipantIdentity,
  createHumanParticipantIdentity,
  getParticipantInitials,
} from "@/lib/chat/participant-identity";

describe("participant identity", () => {
  it("creates deterministic initials for human fallbacks", () => {
    expect(getParticipantInitials("  Ada   Lovelace  ")).toBe("AL");
    expect(getParticipantInitials("Prince")).toBe("PR");
    expect(getParticipantInitials("   ")).toBe("?");

    expect(
      createHumanParticipantIdentity({
        id: "user-1",
        displayName: "Ada Lovelace",
        avatarUrl: null,
        currentUserId: "user-1",
      })
    ).toEqual({
      id: "user-1",
      displayName: "Ada Lovelace",
      type: "human",
      avatarUrl: null,
      initials: "AL",
      isCurrentUser: true,
    });
  });

  it.each([
    ["openai", "ChatGPT"],
    ["anthropic", "Claude"],
    ["google", "Gemini"],
  ])("maps %s to its named AI identity", (providerId, displayName) => {
    expect(createAiParticipantIdentity(providerId)).toEqual({
      id: `ai:${providerId}`,
      displayName,
      type: "ai",
      providerId,
      avatarUrl: null,
      initials: getParticipantInitials(displayName),
      isCurrentUser: false,
    });
  });

  it("uses the provider ID as the unknown-provider fallback", () => {
    expect(createAiParticipantIdentity("future-model")).toEqual({
      id: "ai:future-model",
      displayName: "future-model",
      type: "ai",
      providerId: "future-model",
      avatarUrl: null,
      initials: "FM",
      isCurrentUser: false,
    });
  });
});
