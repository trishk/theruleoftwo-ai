import { Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth/require-user";
import { updateDisplayName } from "@/app/actions";
import { PROVIDERS } from "@/lib/llm/providers";
import { prisma } from "@/lib/db/prisma";
import { ChatShell } from "@/components/chat/ChatShell";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ModelSelect } from "@/components/settings/ModelSelect";
import { AddIntegrationSection } from "@/components/settings/AddIntegrationSection";

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

    const integrations = await prisma.userIntegration.findMany({
        where: {
            userId: user.id,
        },
    });

    const configuredProviders = integrations
        .filter(
            (integration) =>
                integration.encryptedApiKey &&
                integration.keyIv &&
                integration.keyAuthTag
        )
        .map((integration) => integration.provider);

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
                        <AddIntegrationSection configuredProviders={configuredProviders} 
                        />

                        <div className="mt-4 grid gap-3">
                            {Object.entries(PROVIDERS).map(([providerId, provider]) => {
                                const integration = integrations.find(
                                    (item) => item.provider === providerId
                                );

                                const isConfigured = Boolean(
                                    integration?.encryptedApiKey &&
                                    integration?.keyIv &&
                                    integration?.keyAuthTag
                                );

                                const selectedModel =
                                    integration?.selectedModel ?? provider.defaultModel;

                                return (
                                    <div
                                        key={providerId}
                                        className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4"
                                    >
                                        <div>
                                            <div className="font-medium">
                                                {provider.displayName}
                                            </div>

                                            <ModelSelect
                                                provider={providerId}
                                                models={provider.models}
                                                selectedModel={selectedModel}
                                            />
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className={[
                                                        "h-2 w-2 rounded-full",
                                                        isConfigured
                                                            ? "bg-emerald-500"
                                                            : "bg-zinc-500",
                                                    ].join(" ")}
                                                />

                                                <span className="text-xs text-muted-foreground">
                                                    {isConfigured
                                                        ? "Configured"
                                                        : "Not configured"}
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
                                );
                            })}
                        </div>
                    </section>
                </div>
            </div>
        </ChatShell>
    );
}