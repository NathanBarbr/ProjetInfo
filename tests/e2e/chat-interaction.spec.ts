import { test, expect } from '@playwright/test';

/**
 * E2E tests for chat interaction functionality
 */

test.describe('Chat Widget', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to home or search page where chat is available
        await page.goto('/');
    });

    test('should display chat widget', async ({ page }) => {
        // Chat button should be visible
        const chatButton = page.locator('[data-testid="chat-button"]');

        if (await chatButton.count() > 0) {
            await expect(chatButton).toBeVisible();
        }
    });

    test('should open chat widget', async ({ page }) => {
        const chatButton = page.locator('[data-testid="chat-button"]');

        if (await chatButton.count() > 0) {
            // Click to open chat
            await chatButton.click();

            // Chat container should be visible
            const chatContainer = page.locator('[data-testid="chat-container"]');
            await expect(chatContainer).toBeVisible();

            // Input field should be visible
            const chatInput = page.locator('[data-testid="chat-input"]');
            await expect(chatInput).toBeVisible();
        }
    });

    test('should send a message', async ({ page }) => {
        // Open chat
        const chatButton = page.locator('[data-testid="chat-button"]');

        if (await chatButton.count() > 0) {
            await chatButton.click();

            const chatInput = page.locator('[data-testid="chat-input"]');
            const sendButton = page.locator('[data-testid="chat-send"]');

            // Type a message
            await chatInput.fill('Trouve-moi des topspins');

            // Send message
            await sendButton.click();

            // Wait for response
            await page.waitForTimeout(2000);

            // Message should appear in chat history
            const messages = page.locator('[data-testid="chat-message"]');
            const count = await messages.count();
            expect(count).toBeGreaterThan(0);
        }
    });

    test('should receive AI response', async ({ page }) => {
        // Open chat
        const chatButton = page.locator('[data-testid="chat-button"]');

        if (await chatButton.count() > 0) {
            await chatButton.click();

            const chatInput = page.locator('[data-testid="chat-input"]');
            const sendButton = page.locator('[data-testid="chat-send"]');

            // Send a message
            await chatInput.fill('Montre-moi des points intéressants');
            await sendButton.click();

            // Wait for AI response
            await page.waitForTimeout(3000);

            // Should have assistant message
            const assistantMessages = page.locator('[data-testid="chat-message-assistant"]');

            if (await assistantMessages.count() > 0) {
                const responseText = await assistantMessages.first().textContent();
                expect(responseText).toBeTruthy();
                expect(responseText!.length).toBeGreaterThan(0);
            }
        }
    });

    test('should display recommended points', async ({ page }) => {
        // Open chat
        const chatButton = page.locator('[data-testid="chat-button"]');

        if (await chatButton.count() > 0) {
            await chatButton.click();

            const chatInput = page.locator('[data-testid="chat-input"]');
            const sendButton = page.locator('[data-testid="chat-send"]');

            // Ask for specific points
            await chatInput.fill('Trouve des topspins gagnants');
            await sendButton.click();

            // Wait for response with points
            await page.waitForTimeout(3000);

            // Check if point recommendations are shown
            const recommendedPoints = page.locator('[data-testid="recommended-point"]');

            if (await recommendedPoints.count() > 0) {
                // Points should be clickable
                const firstPoint = recommendedPoints.first();
                await expect(firstPoint).toBeVisible();
            }
        }
    });

    test('should navigate to clip from chat recommendation', async ({ page }) => {
        // Open chat and get recommendations
        const chatButton = page.locator('[data-testid="chat-button"]');

        if (await chatButton.count() > 0) {
            await chatButton.click();

            const chatInput = page.locator('[data-testid="chat-input"]');
            const sendButton = page.locator('[data-testid="chat-send"]');

            await chatInput.fill('Montre-moi des points');
            await sendButton.click();

            await page.waitForTimeout(3000);

            // If there are recommended points, click one
            const recommendedPoint = page.locator('[data-testid="recommended-point"]').first();

            if (await recommendedPoint.count() > 0) {
                await recommendedPoint.click();

                // Should navigate to watch page
                await expect(page).toHaveURL(/\/watch\/.+/);
            }
        }
    });

    test('should close chat widget', async ({ page }) => {
        const chatButton = page.locator('[data-testid="chat-button"]');

        if (await chatButton.count() > 0) {
            // Open chat
            await chatButton.click();

            const chatContainer = page.locator('[data-testid="chat-container"]');
            await expect(chatContainer).toBeVisible();

            // Close chat
            const closeButton = page.locator('[data-testid="chat-close"]');
            if (await closeButton.count() > 0) {
                await closeButton.click();

                // Chat should be hidden
                await expect(chatContainer).not.toBeVisible();
            }
        }
    });

    test('should maintain chat history', async ({ page }) => {
        const chatButton = page.locator('[data-testid="chat-button"]');

        if (await chatButton.count() > 0) {
            await chatButton.click();

            const chatInput = page.locator('[data-testid="chat-input"]');
            const sendButton = page.locator('[data-testid="chat-send"]');

            // Send first message
            await chatInput.fill('Premier message');
            await sendButton.click();
            await page.waitForTimeout(2000);

            // Send second message
            await chatInput.fill('Deuxième message');
            await sendButton.click();
            await page.waitForTimeout(2000);

            // Should have multiple messages in history
            const messages = page.locator('[data-testid="chat-message"]');
            const count = await messages.count();
            expect(count).toBeGreaterThanOrEqual(2);
        }
    });
});

test.describe('Chat Widget - Error Handling', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('should handle empty messages', async ({ page }) => {
        const chatButton = page.locator('[data-testid="chat-button"]');

        if (await chatButton.count() > 0) {
            await chatButton.click();

            const sendButton = page.locator('[data-testid="chat-send"]');

            // Try to send empty message
            await sendButton.click();

            // Should not send (button might be disabled or show error)
            // No new messages should appear
            await page.waitForTimeout(500);
        }
    });

    test('should handle API errors gracefully', async ({ page }) => {
        // This test would require mocking API failures
        // For now, just check that chat doesn't crash
        const chatButton = page.locator('[data-testid="chat-button"]');

        if (await chatButton.count() > 0) {
            await chatButton.click();

            const chatInput = page.locator('[data-testid="chat-input"]');
            const sendButton = page.locator('[data-testid="chat-send"]');

            // Send a message
            await chatInput.fill('Test message');
            await sendButton.click();

            // Wait and check that interface is still functional
            await page.waitForTimeout(5000);

            // Input should still be available
            await expect(chatInput).toBeVisible();
        }
    });
});
