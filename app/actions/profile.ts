"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";

export async function updateDisplayName(formData: FormData) {
    const user = await requireUser();

    const name = String(formData.get("displayName") ?? "").trim();

    if (name.length > 50) {
        throw new Error("Display name is too long.");
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
}