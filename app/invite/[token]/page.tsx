import { redirect } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { joinConversationByInvite } from "@/app/actions";

import { GuestJoinForm } from "@/components/chat/navigation/GuestJoinForm";
import { RealtimeConversationSync } from "@/components/chat/realtime/RealtimeConversationSync";

type Props = {
  params: Promise<{
    token: string;
  }>;
};

export default async function InvitePage({
  params,
}: Props) {
  const { token } = await params;

  const invite =
    await prisma.conversationInvite.findUnique({
      where: {
        token,
      },
      include: {
        conversation: {
          select: {
            id: true,
            title: true,
            ownerId: true,
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
            This invitation is invalid,
            expired, or has been revoked.
          </p>
        </div>
      </main>
    );
  }

  const currentUser =
    await getCurrentUser();

  if (currentUser) {
    const isOwner =
      invite.conversation.ownerId ===
      currentUser.id;

    const membership =
      isOwner
        ? null
        : await prisma.conversationMember.findUnique({
            where: {
              conversationId_userId: {
                conversationId:
                  invite.conversationId,
                userId:
                  currentUser.id,
              },
            },
            select: {
              userId: true,
            },
          });

    if (isOwner || membership) {
      redirect(
        `/chat/${invite.conversationId}`
      );
    }
  }

  async function joinExistingUser() {
    "use server";

    await joinConversationByInvite(
      token
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">
          Join conversation
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          You&apos;ve been invited to
          join:
        </p>

        <div className="mt-4 rounded-md bg-muted px-4 py-3 font-medium">
          {invite.conversation.title}
        </div>

        <RealtimeConversationSync
          conversationId={
            invite.conversationId
          }
        >
          {currentUser ? (
            <form
              action={joinExistingUser}
              className="mt-6"
            >
              <p className="mb-4 text-sm text-muted-foreground">
                Join as{" "}
                <span className="font-medium text-foreground">
                  {currentUser.name ??
                    currentUser.email ??
                    "current user"}
                </span>
              </p>

              <button
                type="submit"
                className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Join conversation
              </button>
            </form>
          ) : (
            <GuestJoinForm
              token={token}
            />
          )}
        </RealtimeConversationSync>
      </div>
    </main>
  );
}