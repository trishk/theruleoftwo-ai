import { MessageItem } from "./MessageItem";

type Message = {
  id: number;
  authorType: "human" | "ai";
  authorName: string;
  content: string;
  createdAt: Date;
  replyTo?: {
    id: number;
    authorName: string;
    content: string;
  } | null;
};

type Props = {
  messages: Message[];
  onReply: (message: Message) => void;
};

export function MessageList({ messages, onReply }: Props) {
  if (messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
        No messages yet.
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
        {messages.map((message) => (
          <MessageItem
            key={message.id}
            authorType={message.authorType}
            authorName={message.authorName}
            content={message.content}
            createdAt={message.createdAt}
            replyTo={message.replyTo}
            onReply={() => onReply(message)}
          />
        ))}
      </div>
    </div>
  );
}