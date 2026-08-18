import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";


const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabaseSecretKey =
  process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL is required for E2E tests."
  );
}

if (!supabaseSecretKey) {
  throw new Error(
    "SUPABASE_SECRET_KEY is required for E2E tests."
  );
}

const admin = createClient(
  supabaseUrl,
  supabaseSecretKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);

export type E2EUser = {
  id: string;
  email: string;
  password: string;
};

export async function createE2EUser(): Promise<E2EUser> {
  const email =
    `e2e-${Date.now()}-${crypto.randomUUID()}@example.com`;

  const password =
    `E2E-${crypto.randomUUID()}-Aa1!`;

  const { data, error } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: "E2E User",
      },
    });

  if (error || !data.user) {
    throw new Error(
      error?.message ??
        "Could not create E2E user."
    );
  }

  return {
    id: data.user.id,
    email,
    password,
  };
}

export async function createE2ELoginLink(
  email: string
): Promise<string> {
  const { data, error } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo:
          "http://127.0.0.1:3000/auth/callback",
      },
    });

  if (error) {
    throw new Error(error.message);
  }

  const actionLink =
    data.properties?.action_link;

  if (!actionLink) {
    throw new Error(
      "Supabase did not return an E2E login link."
    );
  }

  return actionLink;
}

export async function deleteE2EUser(
  userId: string
) {
  const { error } =
    await admin.auth.admin.deleteUser(
      userId
    );

  if (error) {
    throw new Error(error.message);
  }
}