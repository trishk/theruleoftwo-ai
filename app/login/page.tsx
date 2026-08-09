"use client";

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
    <main className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">TheRuleOfTwo</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Better decisions need more than one perspective.
          </p>
        </div>

        <button
          type="button"
          onClick={signInWithGoogle}
          className="rounded-md border px-4 py-2 text-sm font-medium"
        >
          Continue with Google
        </button>
      </div>
    </main>
  );
}