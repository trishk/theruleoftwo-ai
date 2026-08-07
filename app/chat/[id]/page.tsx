import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { MessageList } from "@/components/chat/MessageList";
import { MessageComposer } from "@/components/chat/MessageComposer";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ChatPage({ params }: Props) {
  const { id } = await params;
  const conversationId = Number(id);

  const conversation = await prisma.conversation.findUnique({
    where: {
      id: conversationId,
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

  const messages = conversation.messages.map((message) => ({
    id: message.id,
    authorType: message.authorType === "ai" ? ("ai" as const) : ("human" as const),
    authorName: message.authorId,
    content: message.content,
    createdAt: message.createdAt,
  }));

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-6 py-6">
        <ChatHeader />

        <MessageList messages={messages} />

        <MessageComposer conversationId={conversation.id} />
      </div>
    </main>
  );
}