"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  id: number;
  title: string;
};

export function ChatItem({ id, title }: Props) {
  const pathname = usePathname();
  const href = `/chat/${id}`;
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={[
        "block truncate rounded-md px-3 py-2 text-sm transition-colors",
        isActive
          ? "bg-muted font-medium text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      ].join(" ")}
      title={title}
    >
      {title}
    </Link>
  );
}