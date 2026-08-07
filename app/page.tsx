import { createChat } from "./actions";
const chats = [
  { id: 1, title: "Italy Vacation" },
  { id: 2, title: "Heat Pump" },
  { id: 3, title: "New Car" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">TheRuleOfTwo</h1>

          <form action={createChat}>
  <button
    type="submit"
    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
  >
    + New Chat
  </button>
</form>
        </div>

        <div className="space-y-2">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className="cursor-pointer rounded-lg border p-4 hover:bg-muted"
            >
              {chat.title}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}