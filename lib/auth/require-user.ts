import "server-only";

import { redirect } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { createClient } from "@/lib/supabase/server";

export async function getCurrentUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  const isGuest =
    user.is_anonymous === true;

  const googleName =
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    null;

  const googleAvatar =
    user.user_metadata?.avatar_url ??
    user.user_metadata?.picture ??
    null;

  const syncedUser = {
    email: user.email ?? null,
    name: googleName,
    avatarUrl: googleAvatar,
  };

  const existingUser =
    await prisma.user.findUnique({
      where: {
        id: user.id,
      },
    });

  let appUser = existingUser;

  if (!appUser) {
    appUser = await prisma.user.upsert({
      where: {
        id: user.id,
      },
      update: {
        email: syncedUser.email,
        avatarUrl: syncedUser.avatarUrl,
      },
      create: {
        id: user.id,
        ...syncedUser,
      },
    });
  } else {
    const changedFields: {
      email?: string | null;
      avatarUrl?: string | null;
    } = {};

    if (appUser.email !== syncedUser.email) {
      changedFields.email = syncedUser.email;
    }

    if (appUser.avatarUrl !== syncedUser.avatarUrl) {
      changedFields.avatarUrl = syncedUser.avatarUrl;
    }

    if (Object.keys(changedFields).length > 0) {
      appUser = await prisma.user.update({
        where: {
          id: user.id,
        },
        data: changedFields,
      });
    }
  }

  return {
    id: appUser.id,
    email: appUser.email,
    name: appUser.name,
    avatarUrl: appUser.avatarUrl,
    createdAt: appUser.createdAt,
    updatedAt: appUser.updatedAt,
    isGuest,
  };
}

export async function requireUser() {
  const user =
    await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}
