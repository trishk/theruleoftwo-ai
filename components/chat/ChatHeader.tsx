import { createChat } from "@/app/actions";

export function ChatHeader() {
  return (
    <div className="mb-8 flex items-center justify-between">
      <h1 className="text-2xl font-semibold">TheRuleOfTwo.ai</h1>

      <form action={createChat}>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          + New Chat
        </button>
      </form>
    </div>
  );
}