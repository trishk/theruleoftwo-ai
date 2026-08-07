import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatList } from "@/components/chat/ChatList";
import { prisma } from "@/lib/db/prisma";

export default async function Home() {
  const chats = await prisma.conversation.findMany({
    orderBy: {
      updatedAt: "desc",
    },
  });

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <ChatHeader />
        <ChatList chats={chats} />
      </div>
    </main>
  );
}