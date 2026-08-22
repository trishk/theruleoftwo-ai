import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

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