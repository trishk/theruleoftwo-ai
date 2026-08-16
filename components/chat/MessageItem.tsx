import { Reply } from "lucide-react";
import { PROVIDER_LIST } from "@/lib/llm/providerMeta";

type AuthorType = "human" | "ai";

type Props = {
    authorType: AuthorType;
    authorName: string;
    content: string;
    createdAt: Date;
    isOwnMessage: boolean;
    replyTo?: {
        id: number;
        authorName: string;
        content: string;
    } | null;
    onReply: () => void;
};

export function MessageItem({
    authorType,
    authorName,
    content,
    isOwnMessage,
    replyTo,
    onReply,
}: Props) {

    if (isOwnMessage) {
        return (
            <div className="group flex justify-end py-3">
                <div className="flex max-w-[75%] items-start gap-2">
                    <button
                        type="button"
                        onClick={onReply}
                        aria-label={`Reply to ${authorName}`}
                        title={`Reply to ${authorName}`}
                        className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100"
                    >
                        <Reply className="h-4 w-4" />
                    </button>

                    <div className="min-w-0 text-right">
                        <div className="mb-1.5 text-sm font-semibold text-foreground">
                            {authorName}
                        </div>

                        {replyTo && (
                            <div className="mb-2 rounded-md border-r-2 border-border bg-muted/30 py-2 pr-3 pl-2 text-xs text-muted-foreground">
                                <div className="font-medium">{replyTo.authorName}</div>
                                <div className="truncate">{replyTo.content}</div>
                            </div>
                        )}

                        <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                            {content}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const provider = PROVIDER_LIST.find(
        (item) =>
            item.id.toLowerCase() === authorName.toLowerCase() ||
            item.name.toLowerCase() === authorName.toLowerCase()
    );

    const dotClass = provider?.dotClass ?? "bg-zinc-500";
    const colorClass = provider?.colorClass ?? "text-muted-foreground";

    return (
        <div className="group flex gap-3 py-3">
            <div className={`mt-1.5 h-2.5 w-2.5 rounded-full ${dotClass}`} />

            <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center gap-2">
                    <div className={`text-sm font-semibold ${colorClass}`}>
                        {provider?.name ?? authorName}
                    </div>

                    <button
                        type="button"
                        onClick={onReply}
                        aria-label={`Reply to ${authorName}`}
                        title={`Reply to ${authorName}`}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100"
                    >
                        <Reply className="h-3.5 w-3.5" />
                    </button>
                </div>

                {replyTo && (
                    <div className="mb-2 rounded-md border-l-2 border-border bg-muted/30 py-2 pr-2 pl-3 text-xs text-muted-foreground">
                        <div className="font-medium">{replyTo.authorName}</div>
                        <div className="truncate">{replyTo.content}</div>
                    </div>
                )}

                <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {content}
                </div>
            </div>
        </div>
    );
}