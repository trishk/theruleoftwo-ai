import { defineConfig, devices } from "@playwright/test";

import {
  E2E_CALLBACK_URL,
  E2E_ORIGIN,
  assertConsistentE2EOrigins,
  createE2EWebServerEnvironment,
} from "./e2e/config.mjs";

const webServerEnvironment =
  createE2EWebServerEnvironment();

assertConsistentE2EOrigins({
  baseURL: E2E_ORIGIN,
  webServerUrl: E2E_ORIGIN,
  appUrl: webServerEnvironment.APP_URL,
  callbackUrl: E2E_CALLBACK_URL,
});

export default defineConfig({
  testDir: "./e2e",

  fullyParallel: false,

  workers: 1,

  use: {
    baseURL: E2E_ORIGIN,
    trace: "off",
    screenshot: "off",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: E2E_ORIGIN,
    env: webServerEnvironment,
    reuseExistingServer: false,
  },
});
