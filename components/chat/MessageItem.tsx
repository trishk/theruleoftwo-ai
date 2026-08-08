import { PROVIDER_LIST } from "@/lib/llm/providerMeta";

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

  if (isHuman) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl bg-primary px-4 py-3 text-primary-foreground sm:max-w-[75%]">
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {content}
          </div>
        </div>
      </div>
    );
  }

  const provider = PROVIDER_LIST.find(
    (item) => item.name.toLowerCase() === authorName.toLowerCase()
  );

  const dotClass = provider?.dotClass ?? "bg-zinc-500";
  const colorClass = provider?.colorClass ?? "text-muted-foreground";

  return (
    <div className="flex gap-3">
      <div className="pt-1.5">
        <div className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
      </div>

      <div className="min-w-0 flex-1">
        <div className={`mb-1.5 text-sm font-semibold ${colorClass}`}>
          {authorName}
        </div>

        <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {content}
        </div>
      </div>
    </div>
  );
}