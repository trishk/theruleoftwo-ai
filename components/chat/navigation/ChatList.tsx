import { ChatItem } from "./ChatItem";
import type { ConversationSummary } from "@/lib/chat/conversation-summary";

type Props = {
  chats: ConversationSummary[];
  currentUserId: string;
  isGuest?: boolean;
};

export function ChatList({
  chats,
  currentUserId,
  isGuest = false,
}: Props) {
  if (chats.length === 0) {
    return (
      <p className="px-2 text-sm text-muted-foreground">
        No chats yet.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {chats.map((chat) => (
        <ChatItem
          key={chat.id}
          chat={chat}
          currentUserId={currentUserId}
          isGuest={isGuest}
        />
      ))}
    </div>
  );
}