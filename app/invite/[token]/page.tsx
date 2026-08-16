import { prisma } from "@/lib/db/prisma";
import { GuestJoinForm } from "@/components/chat/GuestJoinForm";
import { RealtimeConversationSync } from "@/components/chat/RealtimeConversationSync";

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
          id: true,
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

        <RealtimeConversationSync
          conversationId={invite.conversationId}
        >
          <GuestJoinForm token={token} />
        </RealtimeConversationSync>
      </div>
    </main>
  );
}