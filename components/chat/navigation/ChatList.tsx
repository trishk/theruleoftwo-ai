import { ChatItem } from "./ChatItem";

type Chat = {
  id: number;
  publicId: string;
  title: string;
  ownerId: string;
  hasUnread?: boolean;
};

type Props = {
  chats: Chat[];
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
          id={chat.id}
          publicId={chat.publicId}
          title={chat.title}
          isOwner={
            chat.ownerId ===
            currentUserId
          }
          isGuest={isGuest}
          hasUnread={
            chat.hasUnread ?? false
          }
        />
      ))}
    </div>
  );
}