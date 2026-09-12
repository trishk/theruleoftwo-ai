import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import crypto from "crypto";

import e2eConfig from "./config.cjs";
import { createGuardedE2EAdminClient } from "./supabase-safety";

const { E2E_CALLBACK_URL } = e2eConfig;

let admin: ReturnType<typeof createClient> | undefined;

function getAdminClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  admin ??= createGuardedE2EAdminClient(
    {
      nodeEnv: process.env.NODE_ENV,
      e2eTesting: process.env.E2E_TESTING,
      publicUrl: supabaseUrl,
      allowedProjectRef:
        process.env.E2E_ALLOWED_SUPABASE_PROJECT_REF,
    },
    () => {
      const supabaseSecretKey =
        process.env.SUPABASE_SECRET_KEY;

      if (!supabaseSecretKey) {
        throw new Error(
          "E2E Supabase administrator credential is not configured."
        );
      }

      return createClient(
        supabaseUrl!,
        supabaseSecretKey,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        }
      );
    }
  );

  return admin;
}

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
    await getAdminClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: "E2E User",
      },
    });

  if (error || !data.user) {
    throw new Error("Could not create E2E user.");
  }

  return {
    id: data.user.id,
    email,
    password,
  };
}

export async function loginE2EUser(
  page: Page,
  email: string
): Promise<void> {
  const { data, error } =
    await getAdminClient().auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo:
          E2E_CALLBACK_URL,
      },
    });

  if (error) {
    throw new Error("Could not create E2E login link.");
  }

  const tokenHash =
    data.properties?.hashed_token;

  if (!tokenHash) {
    throw new Error(
      "Supabase did not return an E2E login token."
    );
  }

  const response = await page.request.post(
    E2E_CALLBACK_URL,
    {
      data: { tokenHash },
    }
  );

  if (!response.ok()) {
    throw new Error(
      "Could not establish the E2E login session."
    );
  }

  await page.goto("/");
}

export async function deleteE2EUser(
  userId: string
) {
  const { error } =
    await getAdminClient().auth.admin.deleteUser(
      userId
    );

  if (error) {
    throw new Error("Could not delete E2E user.");
  }
}
