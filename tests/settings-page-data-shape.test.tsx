import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireUserMock,
  integrationFindManyMock,
  membershipFindFirstMock,
  redirectMock,
  getConversationSummariesMock,
  chatSidebarMock,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  integrationFindManyMock: vi.fn(),
  membershipFindFirstMock: vi.fn(),
  redirectMock: vi.fn(),
  getConversationSummariesMock: vi.fn(),
  chatSidebarMock: vi.fn(() => null),
}));

vi.mock("@/lib/auth/require-user", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    conversationMember: { findFirst: membershipFindFirstMock },
    userIntegration: { findMany: integrationFindManyMock },
  },
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/chat/get-conversation-summaries", () => ({
  getConversationSummaries: getConversationSummariesMock,
}));
vi.mock("@/app/actions", () => ({ updateDisplayName: vi.fn() }));
vi.mock("@/components/brand/ProviderIcon", () => ({
  ProviderIcon: () => null,
}));
vi.mock("@/components/chat/navigation/ChatShell", () => ({
  ChatShell: ({ children, sidebar }: { children: React.ReactNode; sidebar: React.ReactNode }) => <>{sidebar}{children}</>,
}));
vi.mock("@/components/chat/navigation/ChatSidebar", () => ({
  ChatSidebar: chatSidebarMock,
}));
vi.mock("@/components/settings/AddIntegrationSection", () => ({
  AddIntegrationSection: () => null,
}));
vi.mock("@/components/settings/ModelSelect", () => ({
  ModelSelect: () => null,
}));
vi.mock("@/components/settings/RemoveIntegrationButton", () => ({
  RemoveIntegrationButton: () => null,
}));

import SettingsPage from "@/app/settings/page";

describe("settings data access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserMock.mockResolvedValue({
      id: "user-1",
      name: "User One",
      isGuest: false,
    });
    getConversationSummariesMock.mockResolvedValue([]);
    integrationFindManyMock.mockResolvedValue([]);
  });

  it("reads only the authenticated user's integrations", async () => {
    renderToStaticMarkup(await SettingsPage());

    expect(integrationFindManyMock).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: {
        provider: true,
        selectedModel: true,
        encryptedApiKey: true,
        keyIv: true,
        keyAuthTag: true,
      },
    });
  });

  it("uses the shared conversation summary loader", async () => {
    const summaries = [{ id: 1, publicId: "one", title: "One", ownerId: "user-1" }];
    getConversationSummariesMock.mockResolvedValue(summaries);

    renderToStaticMarkup(await SettingsPage());

    expect(getConversationSummariesMock).toHaveBeenCalledWith({
      currentUserId: "user-1",
      activeConversationId: null,
    });
    expect(chatSidebarMock).toHaveBeenCalledWith(
      expect.objectContaining({ chats: summaries }),
      undefined,
    );
  });

  it("redirects a membership-only user before reading settings integrations", async () => {
    getConversationSummariesMock.mockResolvedValue([
      { ownerId: "owner-1" },
    ]);
    membershipFindFirstMock.mockResolvedValue({
      conversation: { publicId: "member-chat" },
    });
    redirectMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(SettingsPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/chat/member-chat");
    expect(integrationFindManyMock).not.toHaveBeenCalled();
  });

  it("allows a mixed owner and member to load Settings", async () => {
    getConversationSummariesMock.mockResolvedValue([
      { ownerId: "someone-else" },
      { ownerId: "user-1" },
    ]);

    renderToStaticMarkup(await SettingsPage());

    expect(redirectMock).not.toHaveBeenCalled();
    expect(integrationFindManyMock).toHaveBeenCalled();
  });

  it("stacks profile and provider controls on mobile while preserving sm rows", async () => {
    const markup = renderToStaticMarkup(await SettingsPage());

    expect(markup).toContain("flex flex-col gap-2 sm:flex-row");
    expect(markup).toContain("min-w-0 w-full flex-1");
    expect(markup).toContain("sm:min-h-10 sm:w-auto");
    expect(markup).toContain("flex flex-col items-stretch gap-4");
    expect(markup).toContain("sm:flex-row sm:items-center sm:justify-between");
  });

  it("redirects guests before reading settings integrations", async () => {
    requireUserMock.mockResolvedValue({
      id: "guest-1",
      name: "Guest One",
      isGuest: true,
    });
    membershipFindFirstMock.mockResolvedValue({
      conversation: { publicId: "guest-chat" },
    });
    redirectMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(SettingsPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/chat/guest-chat");
    expect(integrationFindManyMock).not.toHaveBeenCalled();
  });
});
