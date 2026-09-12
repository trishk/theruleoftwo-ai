export const E2E_ORIGIN = "http://127.0.0.1:3000";
export const E2E_CALLBACK_URL = `${E2E_ORIGIN}/auth/callback`;

export function createE2EWebServerEnvironment() {
  return {
    APP_URL: E2E_ORIGIN,
    DATABASE_URL: "file:./e2e.db",
    E2E_TESTING: "1",
    API_KEY_ENCRYPTION_KEY:
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  };
}

export function assertConsistentE2EOrigins({
  baseURL,
  webServerUrl,
  appUrl,
  callbackUrl,
}) {
  if (
    baseURL !== E2E_ORIGIN ||
    webServerUrl !== E2E_ORIGIN ||
    appUrl !== E2E_ORIGIN ||
    callbackUrl !== E2E_CALLBACK_URL
  ) {
    throw new Error("E2E origins are not configured consistently.");
  }
}
