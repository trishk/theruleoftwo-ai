import { createClient } from "@/lib/supabase/server";

export function validateGuestDisplayName(
  displayName: string
) {
  const name =
    displayName.trim();

  if (!name) {
    throw new Error(
      "Display name is required."
    );
  }

  if (name.length > 50) {
    throw new Error(
      "Display name is too long."
    );
  }

  return name;
}

export async function createGuestUser(
  displayName: string
) {
  const name =
    validateGuestDisplayName(
      displayName
    );

  const supabase =
    await createClient();

  const {
    data,
    error,
  } =
    await supabase.auth.signInAnonymously({
      options: {
        data: {
          name,
        },
      },
    });

  if (error) {
    throw new Error(
      error.message
    );
  }

  if (!data.user) {
    throw new Error(
      "Could not create guest user."
    );
  }

  const userId =
    data.user.id;

  return {
    userId,
    name,
  };
}
