import type { ChatReply } from "../conversation/types";

type Props = {
  replyTo: ChatReply;
  onCancel: () => void;
};

export function ReplyPreview({
  replyTo,
  onCancel,
}: Props) {
  return (
    <div
      data-testid="reply-preview"
      className="flex min-w-0 items-center justify-between gap-3 border-b border-border px-3 py-1 text-xs"
    >
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
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:h-8 md:w-8"
      >
        <span
          aria-hidden="true"
          className="text-base leading-none"
        >
          ×
        </span>
      </button>
    </div>
  );
}
