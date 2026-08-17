import { ChatItem } from "./ChatItem";

type ChatListItem = {
  id: number;
  title: string;
  ownerId: string;
};

type Props = {
  chats: ChatListItem[];
  currentUserId: string;
};

export function ChatList({
  chats,
  currentUserId,
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
          title={chat.title}
          isOwner={
            chat.ownerId === currentUserId
          }
        />
      ))}
    </div>
  );
}