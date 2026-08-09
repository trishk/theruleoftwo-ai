import { ChatHeader } from "@/components/chat/ChatHeader";
import { ChatList } from "@/components/chat/ChatList";
import { prisma } from "@/lib/db/prisma";
import { ChatShell } from "@/components/chat/ChatShell";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { requireUser } from "@/lib/auth/require-user";

export default async function Home() {
   const user = await requireUser();

  const chats = await prisma.conversation.findMany({
    where: {
      ownerId: user.id,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return (
  <ChatShell sidebar={<ChatSidebar  chats={chats} />}>
    <div className="flex min-h-dvh flex-col px-4 py-6 sm:px-6 sm:py-10">
      <ChatHeader />

      <div className="flex flex-1 items-center justify-center px-4">
  <div className="w-full max-w-2xl text-center">
    <div className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
      TheRuleOfTwo.ai
    </div>

    <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
      One question.
      <br />
      Multiple perspectives.
    </h1>

    <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
      Bring different AI perspectives into the same conversation and make
      better decisions.
    </p>

    <div className="mt-8 flex flex-wrap justify-center gap-2">
      {[
        "Compare options",
        "Challenge an idea",
        "Make a decision",
      ].map((item) => (
        <div
          key={item}
          className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground"
        >
          {item}
        </div>
      ))}
    </div>
  </div>
</div>
    </div>
  </ChatShell>
);
}