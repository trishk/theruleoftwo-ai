import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const projectRoot = resolve(__dirname, "..");

function readProjectFile(path: string) {
  return readFileSync(
    resolve(projectRoot, path),
    "utf8"
  );
}

describe("Realtime publicId regression guards", () => {
  it("never interpolates a numeric conversation ID into a Realtime topic", () => {
    const realtimeSources = [
      "components/chat/realtime/RealtimeConversationSync.tsx",
      "components/chat/realtime/RealtimeSidebarSync.tsx",
    ].map(readProjectFile);

    for (const source of realtimeSources) {
      expect(source).not.toMatch(
        /`conversation:\$\{conversationId\}`/
      );
      expect(source).toMatch(
        /`conversation:\$\{conversationPublicId\}`/
      );
    }
  });

  it("passes publicIds through the active chat and invite Realtime flows", () => {
    const chatPage = readProjectFile(
      "app/chat/[id]/page.tsx"
    );
    const invitePage = readProjectFile(
      "app/invite/[token]/page.tsx"
    );

    expect(chatPage).toContain(
      "conversationPublicIds={chats.map("
    );
    expect(chatPage).toContain(
      "activeConversationPublicId={"
    );
    expect(chatPage).toContain(
      "conversationPublicId={"
    );
    expect(invitePage).toContain(
      "invite.conversation.publicId"
    );
    expect(invitePage).not.toMatch(
      /<RealtimeConversationSync[\s\S]*?conversationId=/
    );
  });

  it("uses publicId for ChatItem sidebar broadcasts while retaining id for server actions", () => {
    const chatItem = readProjectFile(
      "components/chat/navigation/ChatItem.tsx"
    );

    expect(chatItem).toMatch(
      /broadcastConversationUpdated\(\s*publicId\s*\)/
    );
    expect(chatItem).toMatch(
      /renameConversation\(\s*id,/
    );
    expect(chatItem).toMatch(
      /deleteConversation\(\s*id\s*\)/
    );
  });
});
