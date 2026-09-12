import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isSafeE2EMode } from "@/lib/llm/e2e-mode";

export async function POST(
  request: Request
) {
  if (!isSafeE2EMode()) {
    return new Response(null, {
      status: 404,
    });
  }

  const body: unknown =
    await request.json();

  const tokenHash =
    typeof body === "object" &&
    body !== null &&
    "tokenHash" in body &&
    typeof body.tokenHash === "string"
      ? body.tokenHash
      : null;

  if (!tokenHash) {
    return new Response(null, {
      status: 400,
    });
  }

  const supabase =
    await createClient();

  const { error } =
    await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "magiclink",
    });

  return new Response(null, {
    status: error ? 401 : 204,
  });
}

export async function GET(
  request: Request
) {
  const { searchParams } =
    new URL(request.url);

  const code =
    searchParams.get("code");

  if (code) {
    const supabase =
      await createClient();

    const { error } =
      await supabase.auth
        .exchangeCodeForSession(
          code
        );

    if (!error) {
      const appUrl =
        process.env.APP_URL ??
        "http://localhost:3000";

      return NextResponse.redirect(
        `${appUrl}/`
      );
    }
  }

  const appUrl =
    process.env.APP_URL ??
    "http://localhost:3000";

  return NextResponse.redirect(
    `${appUrl}/login`
  );
}
