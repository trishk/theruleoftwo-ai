"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
    const supabase = await createClient();

    await supabase.auth.signOut();

    redirect("/login");
}

export async function signInGuest(displayName: string) {
    const name = displayName.trim();

    if (!name) {
        throw new Error("Display name is required.");
    }

    if (name.length > 50) {
        throw new Error("Display name is too long.");
    }

    const supabase = await createClient();

    const { data, error } =
        await supabase.auth.signInAnonymously({
            options: {
                data: {
                    name,
                },
            },
        });

    if (error) {
        throw new Error(error.message);
    }

    if (!data.user) {
        throw new Error("Could not create guest user.");
    }

    return data.user.id;
}