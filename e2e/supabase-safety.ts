export const E2E_SUPABASE_GUARD_ERROR =
  "E2E Supabase safety guard rejected configuration.";

type E2ESupabaseSafetyInput = {
  nodeEnv?: string;
  e2eTesting?: string;
  publicUrl?: string;
  allowedProjectRef?: string;
};

function reject(): never {
  throw new Error(E2E_SUPABASE_GUARD_ERROR);
}

export function assertSafeE2ESupabaseProject({
  nodeEnv,
  e2eTesting,
  publicUrl,
  allowedProjectRef,
}: E2ESupabaseSafetyInput): void {
  if (
    !nodeEnv ||
    nodeEnv === "production" ||
    e2eTesting !== "1" ||
    !publicUrl ||
    !allowedProjectRef ||
    !/^[a-z0-9]{20}$/.test(allowedProjectRef)
  ) {
    reject();
  }

  let url: URL;

  try {
    url = new URL(publicUrl);
  } catch {
    reject();
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    reject();
  }

  const match = url.hostname.match(
    /^([a-z0-9]{20})\.supabase\.co$/
  );

  if (!match || match[1] !== allowedProjectRef) {
    reject();
  }
}

export function createGuardedE2EAdminClient<T>(
  input: E2ESupabaseSafetyInput,
  createAdminClient: () => T
): T {
  assertSafeE2ESupabaseProject(input);
  return createAdminClient();
}
