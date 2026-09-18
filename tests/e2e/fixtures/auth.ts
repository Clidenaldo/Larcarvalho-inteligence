import { test as base, expect } from '@playwright/test';

export type AuthFixture = {
  loginAs: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

export const test = base.extend<AuthFixture>({
  loginAs: async ({ page }, use) => {
    const loginFn = async (email: string, password: string) => {
      await page.goto('/');

      // Find login button or link
      const loginButton = page
        .locator('a[href*="/login"], button:has-text("Login")')
        .first();
      await loginButton.click();

      // Wait for login page
      await page.waitForURL('**/login');

      // Fill form
      await page.fill('input[type="email"]', email);
      await page.fill('input[type="password"]', password);

      // Submit
      await page.click('button[type="submit"]');

      // Wait for redirect (successful login)
      await page.waitForURL('**/dashboard', { timeout: 5000 }).catch(() => {
        // May redirect to different page based on role, that's ok
      });
    };

    await use(loginFn);
  },

  logout: async ({ page }, use) => {
    const logoutFn = async () => {
      // Find user menu
      const userMenu = page
        .locator('[data-testid="user-menu"], .user-menu')
        .first();
      if (await userMenu.isVisible()) {
        await userMenu.click();

        // Click logout
        const logoutButton = page
          .locator('button:has-text("Logout"), a:has-text("Logout")')
          .first();
        await logoutButton.click();

        // Wait for redirect to login
        await page.waitForURL('**/login', { timeout: 5000 });
      }
    };

    await use(logoutFn);
  },
});

export { expect };
