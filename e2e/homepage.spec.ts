import { test, expect } from "@playwright/test";

import {
  createE2EUser,
  deleteE2EUser,
  loginE2EUser,
} from "./auth";

test(
  "authenticated user can open the homepage without runtime errors",
  async ({ page }) => {
    const user = await createE2EUser();

    try {
      await loginE2EUser(
        page,
        user.email
      );

      await expect(page).toHaveURL(
        /\/$/,
        {
          timeout: 10_000,
        }
      );

      const pageErrors: string[] = [];

      page.on("pageerror", (error) => {
        pageErrors.push(
          error.message
        );
      });

      await page.goto("/");

      await expect(page).toHaveURL(
        /\/$/,
        {
          timeout: 10_000,
        }
      );

      await expect(
        page.getByRole("button", {
          name: "New chat",
        })
      ).toBeVisible();

      expect(pageErrors).toEqual([]);
    } finally {
      await deleteE2EUser(
        user.id
      );
    }
  }
);
