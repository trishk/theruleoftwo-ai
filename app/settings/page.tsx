import { Plus, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth/require-user";
import { updateDisplayName } from "@/app/actions";
import { PROVIDERS } from "@/lib/llm/providers";
import { prisma } from "@/lib/db/prisma";
import { ChatShell } from "@/components/chat/ChatShell";
import { ChatSidebar } from "@/components/chat/ChatSidebar";

export default async function SettingsPage() {
  const user = await requireUser();

  const chats = await prisma.conversation.findMany({
    where: {
      ownerId: user.id,
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      id: true,
      title: true,
    },
  });

  return (
    <ChatShell sidebar={<ChatSidebar chats={chats} />}>
      <div className="h-dvh overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-10">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold">Settings</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage your profile and AI integrations.
            </p>
          </div>

          <section className="mb-10">
            <h2 className="text-lg font-medium">Profile</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose how your name appears in conversations.
            </p>

            <form
              action={updateDisplayName}
              className="mt-4 rounded-lg border border-border bg-card p-4"
            >
              <label
                htmlFor="displayName"
                className="mb-2 block text-sm font-medium"
              >
                Display name
              </label>

              <div className="flex gap-2">
                <input
                  id="displayName"
                  name="displayName"
                  defaultValue={user.name ?? ""}
                  placeholder="Your name"
                  maxLength={50}
                  className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none transition-colors focus:ring-2 focus:ring-ring"
                />

                <button
                  type="submit"
                  className="rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Save
                </button>
              </div>
            </form>
          </section>

          <section>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-medium">AI Integrations</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Configure the AI providers available in your conversations.
                </p>
              </div>

              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-muted"
              >
                <Plus className="h-4 w-4" />
                Add integration
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              {Object.entries(PROVIDERS).map(([providerId, provider]) => (
                <div
                  key={providerId}
                  className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4"
                >
                  <div>
                    <div className="font-medium">
                      {provider.displayName}
                    </div>

                    <select
                    defaultValue={provider.defaultModel}
                    className="mt-2 h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                    >
                    {provider.models.map((model) => (
                        <option key={model} value={model}>
                        {model}
                        </option>
                    ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-emerald-500" />

                      <span className="text-xs text-muted-foreground">
                        Configured
                      </span>
                    </div>

                    <button
                      type="button"
                      aria-label={`Remove ${provider.displayName}`}
                      title={`Remove ${provider.displayName}`}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </ChatShell>
  );
}