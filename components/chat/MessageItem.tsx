type AuthorType = "human" | "ai";

type Props = {
  authorType: AuthorType;
  authorName: string;
  content: string;
  createdAt: Date;
};

export function MessageItem({
  authorType,
  authorName,
  content,
}: Props) {
  const isHuman = authorType === "human";

  return (
    <div className={`flex ${isHuman ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isHuman
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        }`}
      >
        <div className="mb-1 text-xs font-medium opacity-70">
          {authorName}
        </div>

        <div className="whitespace-pre-wrap text-sm">
          {content}
        </div>
      </div>
    </div>
  );
}