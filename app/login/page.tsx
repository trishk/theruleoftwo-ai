"use client";

import { RuleOfTwoLogo } from "@/components/brand/RuleOfTwoLogo";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  async function signInWithGoogle() {
    const supabase = createClient();

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="flex w-full max-w-sm flex-col items-center">
        <div className="flex flex-col items-center">
          <RuleOfTwoLogo
            className="scale-125"
            markClassName="h-6"
          />

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Better decisions need more than one perspective.
          </p>
        </div>

        <button
          type="button"
          onClick={signInWithGoogle}
          className="mt-8 w-full rounded-md border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Continue with Google
        </button>
      </div>
    </main>
  );
}