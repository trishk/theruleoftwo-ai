import { MessageItem } from "./MessageItem";

type Message = {
  id: number;
  authorType: "human" | "ai";
  authorName: string;
  content: string;
  createdAt: Date;
};

type Props = {
  messages: Message[];
};

export function MessageList({ messages }: Props) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        No messages yet.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto py-6">
      {messages.map((message) => (
        <MessageItem
          key={message.id}
          authorType={message.authorType}
          authorName={message.authorName}
          content={message.content}
          createdAt={message.createdAt}
        />
      ))}
    </div>
  );
}