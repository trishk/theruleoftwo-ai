import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/require-user";
import { updateDisplayName } from "@/app/actions";

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

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
          <h2 className="text-lg font-medium">AI Integrations</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure the AI providers available in your conversations.
          </p>

          <div className="mt-4 grid gap-3">
            {[
              ["OpenAI", "ChatGPT"],
              ["Anthropic", "Claude"],
              ["Google", "Gemini"],
            ].map(([provider, assistant]) => (
              <div
                key={provider}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
              >
                <div>
                  <div className="font-medium">{provider}</div>
                  <div className="text-sm text-muted-foreground">
                    {assistant}
                  </div>
                </div>

                <span className="text-xs text-muted-foreground">
                  Configured
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}