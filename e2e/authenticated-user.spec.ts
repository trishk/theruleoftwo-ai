import { test, expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import {
    createE2EUser,
    deleteE2EUser,
} from "./auth";

// Mobile emulation used by the "Mobile UX (Phase 1B)" suite below.
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const MIN_TOUCH_TARGET_PX = 44;

function extractPublicId(url: string): string {
    const match = url.match(/\/chat\/([^/]+)$/);

    if (!match) {
        throw new Error(
            `Could not extract a conversation id from URL: ${url}`
        );
    }

    return match[1];
}

async function loginAsE2EUser(
    page: Page,
    user: { email: string; password: string }
) {
    await page.goto(
        `/e2e-login?email=${encodeURIComponent(
            user.email
        )}&password=${encodeURIComponent(
            user.password
        )}`
    );

    await expect(page).toHaveURL(
        /\/settings$/,
        { timeout: 10_000 }
    );
}

// The mobile drawer only exists in the DOM while open (ChatShell.tsx),
// so "open" state can be detected via the (otherwise ambiguous) pair of
// "Close navigation" controls it renders (a full-screen backdrop button
// and an explicit X button).
async function isMobileDrawerOpen(page: Page) {
    return (
        (await page
            .locator('[aria-label="Close navigation"]')
            .count()) > 0
    );
}

async function ensureMobileDrawerOpen(page: Page) {
    if (await isMobileDrawerOpen(page)) {
        return;
    }

    await page
        .getByRole("button", { name: "Open navigation" })
        .click();

    await expect(
        page
            .locator('[aria-label="Close navigation"]')
            .first()
    ).toBeVisible();
}

async function createChatViaMobileDrawer(
    page: Page
): Promise<string> {
    await ensureMobileDrawerOpen(page);

    const previousUrl = page.url();

    await page
        .getByRole("button", {
            name: "New chat",
            exact: true,
        })
        .click();

    // Wait for an actual URL change, not just a pattern match -- if we're
    // already on a /chat/<id> page (e.g. creating a second conversation),
    // toHaveURL(/\/chat\/[^/]+$/) would be satisfied instantly by the
    // *current* page, before the new navigation lands.
    await page.waitForURL(
        (url) =>
            url.toString() !== previousUrl &&
            /\/chat\/[^/]+$/.test(url.pathname),
        { timeout: 10_000 }
    );

    return page.url();
}

// Conversations are auto-titled from their first message (see
// app/actions/messages.ts), so once a message is sent its text also shows
// up in the sidebar link and the editable chat-header title button. Scope
// lookups of the message bubble itself to its content element so those
// don't collide.
function messageBubbleContent(page: Page, text: string) {
    return page.locator(".whitespace-pre-wrap", {
        hasText: text,
    });
}

async function longPressMessage(
    page: Page,
    text: string
) {
    const message = messageBubbleContent(
        page,
        text
    ).locator("xpath=ancestor::*[@data-testid][1]");

    await message.dispatchEvent("pointerdown", {
        pointerId: 1,
        pointerType: "touch",
        clientX: 20,
        clientY: 20,
        bubbles: true,
    });

    const menu = page.getByRole("menu", {
        name: /^Message actions for/,
    });
    await expect(menu).toBeVisible();

    await message.dispatchEvent("pointerup", {
        pointerId: 1,
        pointerType: "touch",
        clientX: 20,
        clientY: 20,
        bubbles: true,
    });

    return menu;
}

async function assertMinTouchTarget(
    locator: Locator,
    label: string
) {
    const box = await locator.boundingBox();

    expect(
        box,
        `${label}: expected a measurable bounding box`
    ).not.toBeNull();

    if (!box) {
        return;
    }

    expect
        .soft(
            box.width,
            `${label}: width was ${box.width}px, expected >= ${MIN_TOUCH_TARGET_PX}px`
        )
        .toBeGreaterThanOrEqual(
            MIN_TOUCH_TARGET_PX
        );

    expect
        .soft(
            box.height,
            `${label}: height was ${box.height}px, expected >= ${MIN_TOUCH_TARGET_PX}px`
        )
        .toBeGreaterThanOrEqual(
            MIN_TOUCH_TARGET_PX
        );
}

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

test.describe("Mobile UX (Phase 1B)", () => {
    test.use({
        viewport: MOBILE_VIEWPORT,
        hasTouch: true,
        isMobile: true,
    });

    test("mobile drawer closes automatically after selecting another conversation", async ({
        page,
    }) => {
        const user = await createE2EUser();

        try {
            await loginAsE2EUser(page, user);

            const chat1Url =
                await createChatViaMobileDrawer(
                    page
                );
            const chat1Id = extractPublicId(
                chat1Url
            );

            const chat2Url =
                await createChatViaMobileDrawer(
                    page
                );
            const chat2Id = extractPublicId(
                chat2Url
            );

            expect(chat2Id).not.toBe(chat1Id);

            // Deliberately (re)open the drawer, then select the *other*
            // conversation -- this is the exact interaction under test.
            await ensureMobileDrawerOpen(page);

            // The same href exists twice in the DOM: once in the
            // desktop sidebar (display:none at this viewport width) and
            // once in the mobile drawer. Scope to the one actually
            // rendered on screen with the :visible pseudo-class.
            const chat1Link = page.locator(
                `a[href="/chat/${chat1Id}"]:visible`
            );

            await expect(chat1Link).toBeVisible();

            await chat1Link.click();

            // 1. Navigation must succeed.
            await expect(page).toHaveURL(
                new RegExp(`/chat/${chat1Id}$`),
                { timeout: 10_000 }
            );

            // 2. The drawer/backdrop must close automatically -- no manual
            // dismiss tap should be required after picking a conversation.
            await expect(
                page.locator(
                    '[aria-label="Close navigation"]'
                )
            ).toHaveCount(0);
        } finally {
            await deleteE2EUser(user.id);
        }
    });

    test("settings page offers a visible mobile return-to-chat control", async ({
        page,
    }) => {
        const user = await createE2EUser();

        try {
            await loginAsE2EUser(page, user);

            const chatUrl =
                await createChatViaMobileDrawer(
                    page
                );
            const chatId = extractPublicId(
                chatUrl
            );

            // Navigate from the active conversation to Settings, the way a
            // mobile user would: open the drawer, tap Settings.
            await ensureMobileDrawerOpen(page);

            await page
                .getByRole("link", {
                    name: "Settings",
                })
                .click();

            await expect(page).toHaveURL(
                /\/settings$/,
                { timeout: 10_000 }
            );

            // An accessible, visible Back/return-to-chat control must exist
            // on mobile -- the hamburger-drawer round trip is not sufficient
            // exit UX for a page reached from an active conversation.
            const backControl = page
                .getByRole("link", {
                    name: /back to chat|return to chat|^back$/i,
                })
                .or(
                    page.getByRole("button", {
                        name: /back to chat|return to chat|^back$/i,
                    })
                );

            await expect(
                backControl,
                "Expected a visible Back/return-to-chat control on the mobile Settings page"
            ).toBeVisible();

            await backControl.click();

            await expect(page).toHaveURL(
                new RegExp(`/chat/${chatId}$`),
                { timeout: 10_000 }
            );
        } finally {
            await deleteE2EUser(user.id);
        }
    });

    test("long press exposes message actions while chat options remain discoverable", async ({
        page,
    }) => {
        const user = await createE2EUser();

        try {
            await loginAsE2EUser(page, user);

            await createChatViaMobileDrawer(page);

            // Post a plain human message (no @mention, so no provider is
            // generated against) so a reply-eligible message exists.
            const composer = page.getByPlaceholder(
                "Ask for another perspective..."
            );

            await composer.fill(
                "mobile-touch-discoverability-check"
            );

            await composer.press("Enter");

            await expect(composer).toBeEnabled({
                timeout: 15_000,
            });

            // Reload so the message carries its real, persisted id --
            // Reply is only wired up for persisted messages (id > 0).
            await page.reload();

            await expect(
                messageBubbleContent(
                    page,
                    "mobile-touch-discoverability-check"
                )
            ).toBeVisible();

            const replyButton = page.getByRole(
                "button",
                { name: /^Reply to/ }
            );

            const replyBox =
                await replyButton.boundingBox();

            expect(
                replyBox?.width ?? 0,
                "The screen-reader Reply control must not be a permanent visible mobile affordance"
            ).toBeLessThanOrEqual(1);

            const menu = await longPressMessage(
                page,
                "mobile-touch-discoverability-check"
            );

            await expect(
                menu.getByRole("menuitem", {
                    name: "Reply",
                })
            ).toBeVisible();
            await expect(
                menu.getByRole("menuitem", {
                    name: "Copy",
                })
            ).toBeVisible();

            await page.keyboard.press("Escape");
            await expect(menu).toBeHidden();

            await ensureMobileDrawerOpen(page);

            const chatOptionsButton = page
                .getByRole("button", {
                    name: "Chat options",
                })
                .first();

            await expect(
                chatOptionsButton
            ).toBeVisible();

            const chatOptionsOpacity =
                await chatOptionsButton.evaluate(
                    (el) =>
                        getComputedStyle(el)
                            .opacity
                );

            expect
                .soft(
                    Number(chatOptionsOpacity),
                    "Chat options button must be visible on touch without :hover (computed opacity was " +
                        chatOptionsOpacity +
                        ")"
                )
                .toBeGreaterThan(0);
        } finally {
            await deleteE2EUser(user.id);
        }
    });

    test("primary touch targets meet the 44x44 CSS pixel minimum", async ({
        page,
    }) => {
        const user = await createE2EUser();

        try {
            await loginAsE2EUser(page, user);

            // Configure a provider through the real Settings UI so a
            // provider mention chip renders in the composer. No network
            // call is made here -- the key is only ever used if a message
            // actually mentions the provider and is sent, which this test
            // never does. loginAsE2EUser already lands on /settings with
            // the drawer closed, so no navigation is needed here.
            await page
                .getByRole("button", {
                    name: "Add integration",
                })
                .click();

            await page
                .getByLabel("API key")
                .fill(
                    "sk-e2e-test-placeholder-key"
                );

            await page
                .getByRole("button", {
                    name: "Save integration",
                })
                .click();

            await expect(
                page.getByText("Configured").first()
            ).toBeVisible({ timeout: 10_000 });

            await createChatViaMobileDrawer(page);

            // Post a message so a Reply-eligible message exists too.
            const composer = page.getByPlaceholder(
                "Ask for another perspective..."
            );

            await composer.fill(
                "mobile-touch-target-size-check"
            );

            await composer.press("Enter");

            await expect(composer).toBeEnabled({
                timeout: 15_000,
            });

            await page.reload();

            await expect(
                messageBubbleContent(
                    page,
                    "mobile-touch-target-size-check"
                )
            ).toBeVisible();

            await ensureMobileDrawerOpen(page);

            await assertMinTouchTarget(
                page.getByRole("button", {
                    name: "Open navigation",
                }),
                "Mobile navigation menu button"
            );

            await assertMinTouchTarget(
                page
                    .getByRole("button", {
                        name: "Chat options",
                    })
                    .first(),
                "Sidebar chat options button"
            );

            // Close the drawer to reach the composer/message controls
            // underneath it, mirroring the real mobile interaction order.
            await page
                .getByRole("button", {
                    name: "Close navigation",
                })
                .last()
                .click();

            await expect(
                page.locator(
                    '[aria-label="Close navigation"]'
                )
            ).toHaveCount(0);

            await assertMinTouchTarget(
                page.getByRole("button", {
                    name: "Send message",
                }),
                "Composer send button"
            );

            const messageActions =
                await longPressMessage(
                    page,
                    "mobile-touch-target-size-check"
                );

            await assertMinTouchTarget(
                messageActions.getByRole(
                    "menuitem",
                    { name: "Reply" }
                ),
                "Message Reply action"
            );

            await assertMinTouchTarget(
                messageActions.getByRole(
                    "menuitem",
                    { name: "Copy" }
                ),
                "Message Copy action"
            );

            const mentionChip = page.getByRole(
                "button",
                { name: "ChatGPT" }
            );

            if ((await mentionChip.count()) > 0) {
                await assertMinTouchTarget(
                    mentionChip,
                    "Provider mention chip (ChatGPT)"
                );
            }
        } finally {
            await deleteE2EUser(user.id);
        }
    });
});
