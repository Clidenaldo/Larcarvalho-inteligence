import { test, expect } from './fixtures/auth';
import { LoginPage } from './pages/index';

test.describe('Authentication Flow', () => {
  test('Login page loads', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // Should be on login page
    expect(page.url()).toContain('/login');
  });

  test('Dashboard requires authentication', async ({ page }) => {
    // Try accessing dashboard without login
    await page.goto('/dashboard');

    // Should redirect back to login or show login page
    const isRedirected =
      page.url().includes('/login') ||
      (await page
        .locator('input[type="email"], input[type="password"]')
        .first()
        .isVisible()
        .catch(() => false));

    expect(isRedirected).toBeTruthy();
  });

  test('Password field is hidden', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // Verify password field exists
    const passwordField = page.locator('input[type="password"]');
    expect(await passwordField.isVisible()).toBeTruthy();
  });

  test('Email field is visible', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // Verify email field exists
    const emailField = page.locator('input[type="email"]');
    expect(await emailField.isVisible()).toBeTruthy();
  });
});
