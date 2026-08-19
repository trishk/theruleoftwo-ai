import { test, expect } from "@playwright/test";

import {
    createE2EUser,
    deleteE2EUser,
} from "./auth";

test(
    "authenticated user can navigate settings and chats without regression",
    async ({ page }) => {
        const user = await createE2EUser();

        try {
            // Authenticate through the development-only E2E login route.
            await page.goto(
                `/e2e-login?email=${encodeURIComponent(
                    user.email
                )}&password=${encodeURIComponent(
                    user.password
                )}`
            );

            await expect(page).toHaveURL(
                /\/settings$/,
                {
                    timeout: 10_000,
                }
            );

            await expect(
                page.getByRole("heading", {
                    name: "Settings",
                })
            ).toBeVisible();

            //
            // Create a new chat from the sidebar.
            //
            await page
                .getByRole("button", {
                    name: "New chat",
                })
                .click();

            await expect(page).toHaveURL(
                /\/chat\/[^/]+$/, {
                timeout: 10_000,
            }
            );

            //
            // Verify that the chat UI loaded.
            //
            await expect(
                page.getByPlaceholder(
                    "Ask for another perspective..."
                )
            ).toBeVisible();

            //
            // Capture the conversation URL and sidebar title.
            //
            const chatUrl = page.url();

            const chatLink =
                page.locator(
                    'a[href^="/chat/"]'
                ).first();

            await expect(
                chatLink
            ).toBeVisible();

            const chatTitle =
                (
                    await chatLink.textContent()
                )?.trim();

            expect(chatTitle).toBeTruthy();

            //
            // Navigate to Settings from the sidebar.
            //
            await page
                .getByRole("link", {
                    name: "Settings",
                })
                .click();

            await expect(page).toHaveURL(
                /\/settings$/,
                {
                    timeout: 10_000,
                }
            );

            await expect(
                page.getByRole("heading", {
                    name: "Settings",
                })
            ).toBeVisible();

            //
            // The created chat must still exist in the sidebar.
            //
            const existingChatLink =
                page.getByRole("link", {
                    name: chatTitle!,
                });

            await expect(
                existingChatLink
            ).toBeVisible();

            //
            // Navigate back to the chat.
            //
            await existingChatLink.click();

            await expect(page).toHaveURL(
                chatUrl
            );

            //
            // Verify that the composer still works after the round trip.
            //
            const composer =
                page.getByPlaceholder(
                    "Ask for another perspective..."
                );

            await expect(
                composer
            ).toBeVisible();

            await composer.fill(
                "navigation-regression-test"
            );

            await expect(
                composer
            ).toHaveValue(
                "navigation-regression-test"
            );
        } finally {
            await deleteE2EUser(
                user.id
            );
        }
    }
);