import {
  Bot,
  UserRound,
  UsersRound,
} from "lucide-react";

import type { ConversationIconKind } from "@/lib/chat/conversation-presentation";
import { cn } from "@/lib/utils";

type Props = {
  kind: ConversationIconKind;
  label: string;
  className?: string;
  decorative?: boolean;
};

export function ConversationTypeIcon({
  kind,
  label,
  className,
  decorative = false,
}: Props) {
  let icon: React.ReactNode;

  switch (kind) {
    case "human":
      icon = <UserRound aria-hidden="true" className="h-4 w-4" />;
      break;
    case "human-group":
      icon = <UsersRound aria-hidden="true" className="h-4 w-4" />;
      break;
    case "ai":
      icon = <Bot aria-hidden="true" className="h-4 w-4" />;
      break;
    case "multi-ai":
      icon = (
        <>
          <Bot aria-hidden="true" className="h-4 w-4" />
          <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background">
            <Bot aria-hidden="true" className="h-2.5 w-2.5" />
          </span>
        </>
      );
      break;
    case "mixed-group":
      icon = (
        <>
          <UsersRound aria-hidden="true" className="h-4 w-4" />
          <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background">
            <Bot aria-hidden="true" className="h-2.5 w-2.5" />
          </span>
        </>
      );
      break;
    default: {
      const exhaustiveKind: never = kind;
      return exhaustiveKind;
    }
  }

  return (
    <span
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
      title={decorative ? undefined : label}
      className={cn(
        "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground",
        className
      )}
    >
      {icon}
    </span>
  );
}
