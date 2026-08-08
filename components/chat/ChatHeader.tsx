type Props = {
  title?: string;
};

export function ChatHeader({ title = "Conversation" }: Props) {
  return (
    <header className="flex h-14 shrink-0 items-center border-b border-border pl-16 pr-4 md:px-6">
      <span className="truncate text-sm font-medium text-foreground">
        {title}
      </span>
    </header>
  );
}