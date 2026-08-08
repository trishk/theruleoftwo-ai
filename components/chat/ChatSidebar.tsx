import { createChat } from "@/app/actions";
import { ChatList } from "./ChatList";
import { ThemeToggle } from "./ThemeToggle";
import Image from "next/image";

type Props = {
  chats: {
    id: number;
    title: string;
  }[];
};

export function ChatSidebar({ chats }: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1">
        <div className="mb-5 px-2">
         <div className="mb-6 px-3 pt-2">
  <Image
    src="/logo-sidebar2.png"
    alt="The Rule of Two"
    width={260}
    height={90}
    priority
    className="h-auto w-full object-contain object-left"
  />
</div>
        </div>

        <form action={createChat} className="mb-6">
          <button
  type="submit"
  className="group flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-left text-sm font-medium text-foreground transition-all hover:bg-muted hover:shadow-sm active:scale-[0.99]"
>
  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-foreground text-sm text-background transition-transform group-hover:scale-105">
    +
  </span>

  <span>New chat</span>
</button>
        </form>

        <div className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Recent
        </div>

        <ChatList chats={chats} />
      </div>

      <div className="border-t border-border pt-3">
         <ThemeToggle />
      </div>
    </div>
  );
}