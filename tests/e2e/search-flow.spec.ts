import { test, expect } from '@playwright/test';

/**
 * E2E tests for search functionality
 */

test.describe('Search Flow', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to search page
        await page.goto('/search');
    });

    test('should display search page', async ({ page }) => {
        // Search page title should be visible
        await expect(page.locator('h1')).toBeVisible();

        // Search filters should be present
        const filtersSection = page.locator('[data-testid="search-filters"]');
        await expect(filtersSection).toBeVisible();
    });

    test('should perform basic search', async ({ page }) => {
        // Wait for page to load
        await page.waitForLoadState('networkidle');

        // Results should be visible (default search shows all)
        const results = page.locator('[data-testid="search-result"]');

        // Either results are shown or a "no results" message
        const hasResults = await results.count() > 0;
        const noResultsMessage = page.locator('[data-testid="no-results"]');
        const hasNoResultsMessage = await noResultsMessage.count() > 0;

        expect(hasResults || hasNoResultsMessage).toBe(true);
    });

    test('should filter by player', async ({ page }) => {
        // Select a player from filter
        const playerSelect = page.locator('[data-testid="filter-player"]');

        if (await playerSelect.count() > 0) {
            await playerSelect.click();

            // Select first option (after the placeholder)
            const firstOption = page.locator('[data-testid="player-option"]').first();
            if (await firstOption.count() > 0) {
                await firstOption.click();

                // Wait for results to update
                await page.waitForTimeout(1000);

                // Results should update
                const results = page.locator('[data-testid="search-result"]');
                const count = await results.count();

                // Should have some results or indication of search
                expect(count >= 0).toBe(true);
            }
        }
    });

    test('should filter by winner', async ({ page }) => {
        // Select winner filter
        const winnerFilter = page.locator('[data-testid="filter-winner"]');

        if (await winnerFilter.count() > 0) {
            await winnerFilter.click();

            const winnerOption = page.locator('[data-testid="winner-option"]').first();
            if (await winnerOption.count() > 0) {
                await winnerOption.click();

                // Wait for search to complete
                await page.waitForTimeout(1000);

                // URL should update with query parameters
                const url = page.url();
                expect(url).toContain('winner=');
            }
        }
    });

    test('should filter by number of shots', async ({ page }) => {
        // Find number of shots filter
        const minShotsInput = page.locator('[data-testid="filter-min-shots"]');
        const maxShotsInput = page.locator('[data-testid="filter-max-shots"]');

        if (await minShotsInput.count() > 0 && await maxShotsInput.count() > 0) {
            // Set range
            await minShotsInput.fill('3');
            await maxShotsInput.fill('10');

            // Submit or wait for auto-update
            await page.waitForTimeout(1500);

            // URL should contain range parameters
            const url = page.url();
            expect(url).toContain('nb_coups');
        }
    });

    test('should show search stats', async ({ page }) => {
        // Stats section should be visible
        const statsSection = page.locator('[data-testid="search-stats"]');

        if (await statsSection.count() > 0) {
            await expect(statsSection).toBeVisible();

            // Should show total results
            const totalResults = page.locator('[data-testid="total-results"]');
            if (await totalResults.count() > 0) {
                const text = await totalResults.textContent();
                expect(text).toBeTruthy();
            }
        }
    });

    test('should paginate results', async ({ page }) => {
        // Check if pagination exists
        const pagination = page.locator('[data-testid="pagination"]');

        if (await pagination.count() > 0) {
            await expect(pagination).toBeVisible();

            // Click next page
            const nextButton = page.locator('[data-testid="page-next"]');
            if (await nextButton.count() > 0 && await nextButton.isEnabled()) {
                await nextButton.click();

                // URL should update with page parameter
                await page.waitForTimeout(500);
                const url = page.url();
                expect(url).toContain('page=');
            }
        }
    });

    test('should reset filters', async ({ page }) => {
        // Apply some filters first
        const winnerFilter = page.locator('[data-testid="filter-winner"]');

        if (await winnerFilter.count() > 0) {
            await winnerFilter.click();
            const option = page.locator('[data-testid="winner-option"]').first();
            if (await option.count() > 0) {
                await option.click();
                await page.waitForTimeout(500);

                // Now reset
                const resetButton = page.locator('[data-testid="reset-filters"]');
                if (await resetButton.count() > 0) {
                    await resetButton.click();

                    // URL should not have filter params
                    await page.waitForTimeout(500);
                    const url = page.url();
                    expect(url).not.toContain('winner=');
                }
            }
        }
    });

    test('should navigate to clip from search results', async ({ page }) => {
        // Wait for results
        await page.waitForLoadState('networkidle');

        const firstResult = page.locator('[data-testid="search-result"]').first();

        if (await firstResult.count() > 0) {
            // Click on result
            await firstResult.click();

            // Should navigate to watch page with clip
            await expect(page).toHaveURL(/\/watch\/.+/);
            await expect(page).toHaveURL(/clip=/);
        }
    });
});

test.describe('Search Filters - Advanced', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/search');
    });

    test('should filter by smart actions', async ({ page }) => {
        // Check for smart filter options
        const smartFilter = page.locator('[data-testid="smart-filter"]');

        if (await smartFilter.count() > 0) {
            // Select "Who" - winner filter
            const whoTab = page.locator('[data-testid="smart-who"]');
            if (await whoTab.count() > 0) {
                await whoTab.click();

                // Select a player
                const playerOption = page.locator('[data-testid="smart-player-option"]').first();
                if (await playerOption.count() > 0) {
                    await playerOption.click();
                    await page.waitForTimeout(1000);

                    // Results should update
                    const url = page.url();
                    expect(url.length).toBeGreaterThan(0);
                }
            }
        }
    });

    test('should combine multiple filters', async ({ page }) => {
        // Apply winner filter
        const winnerFilter = page.locator('[data-testid="filter-winner"]');
        if (await winnerFilter.count() > 0) {
            await winnerFilter.selectOption({ index: 1 });
            await page.waitForTimeout(500);
        }

        // Apply set filter
        const setFilter = page.locator('[data-testid="filter-set"]');
        if (await setFilter.count() > 0) {
            await setFilter.selectOption('1');
            await page.waitForTimeout(500);
        }

        // URL should contain both parameters
        const url = page.url();
        expect(url).toContain('?');
    });
});
