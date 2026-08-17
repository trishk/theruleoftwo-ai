"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";

const MAX_DISPLAY_NAME_LENGTH = 50;

export async function updateDisplayName(
  formData: FormData
) {
  const user = await requireUser();

  if (user.isGuest) {
    throw new Error(
      "Guests cannot update profile settings."
    );
  }

  const name = String(
    formData.get("displayName") ?? ""
  ).trim();

  if (
    name.length >
    MAX_DISPLAY_NAME_LENGTH
  ) {
    throw new Error(
      "Display name is too long."
    );
  }

  await prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      name: name || null,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/chat/[id]", "page");
}