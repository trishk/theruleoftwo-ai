import {
  Suspense,
} from "react";
import { redirect } from "next/navigation";

import { E2ELoginContent } from "./e2e-login-content";
import { isE2ELoginEnabled } from "@/lib/security/e2e-login";

export const dynamic = "force-dynamic";

export default function E2ELoginPage() {
  if (!isE2ELoginEnabled()) {
    redirect("/login");
  }

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
