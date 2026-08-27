"use client";

import {
  useEffect,
} from "react";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function E2ELoginContent() {
  const router = useRouter();
  const searchParams =
    useSearchParams();

  useEffect(() => {
    async function login() {
      const email =
        searchParams.get("email");

      const password =
        searchParams.get("password");

      if (
        !email ||
        !password
      ) {
        return;
      }

      const supabase =
        createClient();

      const { error } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (error) {
        console.error(error);
        return;
      }

      router.replace(
        "/settings"
      );
    }

    void login();
  }, [
    router,
    searchParams,
  ]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p>
        Signing in for E2E test...
      </p>
    </main>
  );
}
