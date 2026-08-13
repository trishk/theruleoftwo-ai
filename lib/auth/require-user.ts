import "server-only";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { createClient } from "@/lib/supabase/server";

export async function requireUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  const googleName =
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    null;

  const googleAvatar =
    user.user_metadata?.avatar_url ??
    user.user_metadata?.picture ??
    null;

  const appUser = await prisma.user.upsert({
    where: {
      id: user.id,
    },
    update: {
      email: user.email ?? null,
      avatarUrl: googleAvatar,
    },
    create: {
      id: user.id,
      email: user.email ?? null,
      name: googleName,
      avatarUrl: googleAvatar,
    },
  });

  return appUser;
}