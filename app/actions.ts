"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";

export async function createChat() {
  const conversation = await prisma.conversation.create({
    data: {
      title: "New Chat",
    },
  });

  redirect(`/chat/${conversation.id}`);
}