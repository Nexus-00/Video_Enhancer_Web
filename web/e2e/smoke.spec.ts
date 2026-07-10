import { test, expect } from '@playwright/test'

test('home page loads and shows UI', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/AI Video Enhancer/)
  await expect(page.locator('text=Drop a video here or tap to browse')).toBeVisible()
  await expect(page.locator('text=Enhancement settings')).toBeVisible()
  await expect(page.locator('text=Download models')).toBeVisible()
})
