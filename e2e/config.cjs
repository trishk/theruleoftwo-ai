const E2E_ORIGIN = "http://127.0.0.1:3000";
const E2E_CALLBACK_URL = `${E2E_ORIGIN}/auth/callback`;

function createE2EWebServerEnvironment() {
  return {
    APP_URL: E2E_ORIGIN,
    DATABASE_URL: "file:./e2e.db",
    E2E_TESTING: "1",
    API_KEY_ENCRYPTION_KEY:
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  };
}

function assertConsistentE2EOrigins({
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

module.exports = {
  E2E_ORIGIN,
  E2E_CALLBACK_URL,
  createE2EWebServerEnvironment,
  assertConsistentE2EOrigins,
};
