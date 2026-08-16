import type { ChatReply } from "./types";

type Props = {
  replyTo: ChatReply;
  onCancel: () => void;
};

export function ReplyPreview({
  replyTo,
  onCancel,
}: Props) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
      <div className="min-w-0">
        <div className="font-medium">
          Replying to {replyTo.authorName}
        </div>

        <div className="truncate text-muted-foreground">
          {replyTo.content}
        </div>
      </div>

      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel reply"
        title="Cancel reply"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        ×
      </button>
    </div>
  );
}