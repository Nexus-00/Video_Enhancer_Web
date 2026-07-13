import { test, expect } from '@playwright/test'

test('home page loads and shows UI', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/AI Video Enhancer/)
  await expect(page.locator('text=Drop a video here or tap to browse')).toBeVisible()
  await expect(page.locator('text=Enhancement settings')).toBeVisible()
  await expect(page.locator('select:has(option:has-text("90 FPS"))')).toBeVisible()
  await expect(page.locator('select:has(option:has-text("RIFE"))')).toBeVisible()
  await expect(page.locator('select:has(option:has-text("FLAVR"))')).toBeVisible()
  await expect(page.locator('text=Duplicate threshold (MSE)')).toBeVisible()
  await expect(page.locator('text=Upscale scale')).toBeVisible()
  await expect(page.locator('text=Interpolation multiplier')).toBeVisible()
  await expect(page.locator('text=Download models')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible()
})
