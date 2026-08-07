import Link from "next/link";

type Props = {
  id: number;
  title: string;
};

export function ChatItem({ id, title }: Props) {
  return (
    <Link
      href={`/chat/${id}`}
      className="block rounded-lg border p-4 hover:bg-muted"
    >
      {title}
    </Link>
  );
}