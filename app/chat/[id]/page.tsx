import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { MessageList } from "@/components/chat/MessageList";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { ChatShell } from "@/components/chat/ChatShell";
import { ChatList } from "@/components/chat/ChatList";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { requireUser } from "@/lib/auth/require-user";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ChatPage({ params }: Props) {
  const user = await requireUser();
  const { id } = await params;
  const conversationId = Number(id);

  const conversation = await prisma.conversation.findFirst({
  where: {
    id: conversationId,
    ownerId: user.id,
  },
    include: {
      messages: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!conversation) {
    notFound();
  }

  const chats = await prisma.conversation.findMany({
  where: {
    ownerId: user.id,
  },
  orderBy: {
    updatedAt: "desc",
  },
});

  const messages = conversation.messages.map((message) => ({
    id: message.id,
    authorType: message.authorType === "ai" ? ("ai" as const) : ("human" as const),
    authorName:
  message.authorId === user.id
    ? "You"
    : message.authorId === "openai"
      ? "ChatGPT"
      : message.authorId,
    content: message.content,
    createdAt: message.createdAt,
  }));

  return (
  <ChatShell  sidebar={<ChatSidebar  chats={chats} />}>
    <div className="flex min-h-dvh flex-col px-4 py-4 sm:px-6 sm:py-6">
      <ChatHeader title={conversation.title}/>

      <div className="flex min-h-0 flex-1 flex-col">
        <MessageList messages={messages} />

        <MessageComposer conversationId={conversation.id} />
      </div>
    </div>
  </ChatShell>
);
}