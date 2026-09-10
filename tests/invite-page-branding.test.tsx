import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUniqueMock, getCurrentUserMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    conversationInvite: { findUnique: findUniqueMock },
  },
}));
vi.mock("@/lib/auth/require-user", () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock("@/app/actions", () => ({ joinConversationByInvite: vi.fn() }));
vi.mock("@/components/chat/navigation/GuestJoinForm", () => ({
  GuestJoinForm: ({ token }: { token: string }) => <form data-token={token}>Guest flow</form>,
}));
vi.mock("@/components/chat/realtime/RealtimeConversationSync", () => ({
  RealtimeConversationSync: ({ children }: { children: React.ReactNode }) => children,
}));

import InvitePage from "@/app/invite/[token]/page";

describe("invite page branding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue(null);
  });

  it("shows canonical branding and preserves the invalid heading", async () => {
    findUniqueMock.mockResolvedValue(null);
    const markup = renderToStaticMarkup(await InvitePage({ params: Promise.resolve({ token: "bad" }) }));

    expect(markup).toContain('aria-label="TheRuleOfTwo.ai"');
    expect(markup).toContain("<h1");
    expect(markup).toContain("Invalid invite");
  });

  it("keeps the valid guest join flow and token intact", async () => {
    findUniqueMock.mockResolvedValue({
      token: "invite-token",
      revokedAt: null,
      expiresAt: null,
      conversationId: 1,
      conversation: {
        id: 1,
        publicId: "public-chat",
        title: "Decision room",
        ownerId: "owner-1",
      },
    });

    const markup = renderToStaticMarkup(
      await InvitePage({ params: Promise.resolve({ token: "invite-token" }) })
    );

    expect(markup.match(/aria-label="TheRuleOfTwo.ai"/g)).toHaveLength(1);
    expect(markup).toContain("Join conversation");
    expect(markup).toContain("Decision room");
    expect(markup).toContain('data-token="invite-token"');
  });
});
