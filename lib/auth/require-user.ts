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

  const appUser = await prisma.user.upsert({
    where: {
      id: user.id,
    },
    update: {
      email: user.email ?? null,
      name:
        user.user_metadata?.full_name ??
        user.user_metadata?.name ??
        null,
      avatarUrl:
        user.user_metadata?.avatar_url ??
        user.user_metadata?.picture ??
        null,
    },
    create: {
      id: user.id,
      email: user.email ?? null,
      name:
        user.user_metadata?.full_name ??
        user.user_metadata?.name ??
        null,
      avatarUrl:
        user.user_metadata?.avatar_url ??
        user.user_metadata?.picture ??
        null,
    },
  });

  return appUser;
}