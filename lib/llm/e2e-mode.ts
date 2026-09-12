import { assertSafeE2ESupabaseProject } from "@/e2e/supabase-safety";

export function isSafeE2EMode(
  environment: NodeJS.ProcessEnv = process.env
) {
  try {
    assertSafeE2ESupabaseProject({
      nodeEnv: environment.NODE_ENV,
      e2eTesting: environment.E2E_TESTING,
      publicUrl: environment.NEXT_PUBLIC_SUPABASE_URL,
      allowedProjectRef:
        environment.E2E_ALLOWED_SUPABASE_PROJECT_REF,
    });
    return true;
  } catch {
    return false;
  }
}
