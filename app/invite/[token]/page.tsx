import { joinConversationAsGuest } from "@/app/actions";
import { prisma } from "@/lib/db/prisma";

type Props = {
  params: Promise<{
    token: string;
  }>;
};

export default async function InvitePage({ params }: Props) {
  const { token } = await params;

  const invite = await prisma.conversationInvite.findUnique({
    where: {
      token,
    },
    include: {
      conversation: {
        select: {
          title: true,
        },
      },
    },
  });

  const invalid =
    !invite ||
    invite.revokedAt !== null ||
    (invite.expiresAt !== null &&
      invite.expiresAt < new Date());

  if (invalid) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-6">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-6">
          <h1 className="text-xl font-semibold">
            Invalid invite
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            This invitation is invalid, expired, or has been revoked.
          </p>
        </div>
      </main>
    );
  }

  async function joinAction(formData: FormData) {
    "use server";

    const displayName = String(
      formData.get("displayName") ?? ""
    );

    await joinConversationAsGuest(
      token,
      displayName
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">
          Join conversation
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          You&apos;ve been invited to join:
        </p>

        <div className="mt-4 rounded-md bg-muted px-4 py-3 font-medium">
          {invite.conversation.title}
        </div>

        <form action={joinAction} className="mt-6">
          <label
            htmlFor="displayName"
            className="mb-2 block text-sm font-medium"
          >
            Your name
          </label>

          <input
            id="displayName"
            name="displayName"
            type="text"
            required
            maxLength={50}
            placeholder="Enter your name"
            autoComplete="name"
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none transition-colors focus:ring-2 focus:ring-ring"
          />

          <button
            type="submit"
            className="mt-4 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Join conversation
          </button>
        </form>
      </div>
    </main>
  );
}