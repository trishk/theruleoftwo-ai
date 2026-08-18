"use client";

import {
  Suspense,
  useEffect,
} from "react";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import { createClient } from "@/lib/supabase/client";

function E2ELoginContent() {
  const router = useRouter();
  const searchParams =
    useSearchParams();

  useEffect(() => {
    async function login() {
      if (
        process.env.NODE_ENV ===
        "production"
      ) {
        router.replace("/login");
        return;
      }

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

export default function E2ELoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <p>
            Preparing E2E login...
          </p>
        </main>
      }
    >
      <E2ELoginContent />
    </Suspense>
  );
}