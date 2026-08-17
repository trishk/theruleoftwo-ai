import Link from "next/link";
import { createChat, signOut } from "@/app/actions";
import { ChatList } from "./ChatList";
import { ThemeToggle } from "./ThemeToggle";
import {
  LogOut,
  Plus,
  Settings,
} from "lucide-react";

type Props = {
  chats: {
    id: number;
    title: string;
    ownerId: string;
  }[];
  currentUserId: string;
  isGuest?: boolean;
};

export function ChatSidebar({
  chats,
  currentUserId,
  isGuest = false,
}: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1">
        {!isGuest && (
          <form
            action={createChat}
            className="mb-6"
          >
            <button
              type="submit"
              className="group flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-left text-sm font-medium text-foreground transition-all hover:bg-muted hover:shadow-sm active:scale-[0.99]"
            >
              <Plus className="h-4 w-4" />
              New chat
            </button>
          </form>
        )}

        <div className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Recent
        </div>

        <ChatList
          chats={chats}
          currentUserId={currentUserId}
        />
      </div>

      <div className="border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <ThemeToggle />

            {!isGuest && (
              <Link
                href="/settings"
                aria-label="Settings"
                title="Settings"
                className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Settings className="h-4 w-4" />
              </Link>
            )}
          </div>

          <form action={signOut}>
            <button
              type="submit"
              aria-label="Sign out"
              title="Sign out"
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}