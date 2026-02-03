import { test, expect } from '@playwright/test';

/**
 * E2E tests for video playback functionality
 */

test.describe('Video Player', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to home page
        await page.goto('/');
    });

    test('should display video list on home page', async ({ page }) => {
        // Wait for videos to load
        await page.waitForSelector('[data-testid="video-card"]', { timeout: 10000 });

        // Check that at least one video is displayed
        const videoCards = page.locator('[data-testid="video-card"]');
        const count = await videoCards.count();
        expect(count).toBeGreaterThan(0);
    });

    test('should navigate to video watch page', async ({ page }) => {
        // Click on first video
        await page.locator('[data-testid="video-card"]').first().click();

        // Should navigate to watch page
        await expect(page).toHaveURL(/\/watch\/.+/);

        // Video player should be present
        await expect(page.locator('video')).toBeVisible();
    });

    test('should play and pause video', async ({ page }) => {
        // Navigate to a video
        await page.locator('[data-testid="video-card"]').first().click();
        await page.waitForSelector('video');

        const video = page.locator('video');

        // Wait for video to be ready
        await video.waitFor({ state: 'visible' });

        // Click play button (or video itself to play)
        await page.locator('[data-testid="play-button"]').click();

        // Wait a bit for video to start
        await page.waitForTimeout(1000);

        // Check if video is playing (paused property should be false)
        const isPlaying = await video.evaluate((v: HTMLVideoElement) => !v.paused);
        expect(isPlaying).toBe(true);

        // Pause video
        await page.locator('[data-testid="pause-button"]').click();

        // Check if video is paused
        const isPaused = await video.evaluate((v: HTMLVideoElement) => v.paused);
        expect(isPaused).toBe(true);
    });

    test('should display video metadata', async ({ page }) => {
        // Navigate to a video
        await page.locator('[data-testid="video-card"]').first().click();

        // Video title should be visible
        await expect(page.locator('h1')).toBeVisible();

        // Metadata (players, date, etc.) should be present
        const titleText = await page.locator('h1').textContent();
        expect(titleText).toBeTruthy();
        expect(titleText!.length).toBeGreaterThan(0);
    });

    test('should show clips sidebar for videos with clips', async ({ page }) => {
        // Find a video with clips
        const videoCards = page.locator('[data-testid="video-card"]');
        const count = await videoCards.count();

        for (let i = 0; i < count; i++) {
            await videoCards.nth(i).click();

            // Check if clips sidebar exists
            const clipsSidebar = page.locator('[data-testid="clips-sidebar"]');
            const exists = await clipsSidebar.count() > 0;

            if (exists) {
                // Clips should be visible
                await expect(clipsSidebar).toBeVisible();

                // Should have clip items
                const clips = page.locator('[data-testid="clip-item"]');
                const clipCount = await clips.count();
                expect(clipCount).toBeGreaterThan(0);

                break;
            }

            // Go back to home
            await page.goto('/');
        }
    });

    test('should navigate between clips', async ({ page }) => {
        // Navigate to a video with clips
        await page.locator('[data-testid="video-card"]').first().click();

        // Wait for clips sidebar
        const clipsSidebar = page.locator('[data-testid="clips-sidebar"]');

        if (await clipsSidebar.count() > 0) {
            await expect(clipsSidebar).toBeVisible();

            // Click on a clip
            const firstClip = page.locator('[data-testid="clip-item"]').first();
            await firstClip.click();

            // URL should update to include clip
            await expect(page).toHaveURL(/clip=/);

            // Video should update
            await page.waitForTimeout(500);
        }
    });

    test('should display video thumbnail', async ({ page }) => {
        // Check if video cards have thumbnails
        const firstCard = page.locator('[data-testid="video-card"]').first();
        const thumbnail = firstCard.locator('[data-testid="video-thumbnail"]');

        await expect(thumbnail).toBeVisible();

        // Thumbnail should have src attribute
        const src = await thumbnail.getAttribute('src');
        expect(src).toBeTruthy();
    });
});

test.describe('Video Player Responsiveness', () => {
    test('should work on mobile viewport', async ({ page }) => {
        // Set mobile viewport
        await page.setViewportSize({ width: 375, height: 667 });

        await page.goto('/');

        // Videos should still be visible
        await page.waitForSelector('[data-testid="video-card"]');
        const videoCards = page.locator('[data-testid="video-card"]');
        expect(await videoCards.count()).toBeGreaterThan(0);

        // Navigate to video
        await videoCards.first().click();

        // Video player should adapt to mobile
        const video = page.locator('video');
        await expect(video).toBeVisible();
    });
});
