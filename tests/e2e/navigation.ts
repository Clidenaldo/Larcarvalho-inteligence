import type { Page } from '@playwright/test';

/** Navigate through the same client-side links used by desktop and mobile users. */
export async function navigateInApp(page: Page, label: string) {
  const openMenu = page.getByRole('button', {
    name: 'Abrir menu',
    exact: true,
  });
  if (await openMenu.isVisible()) await openMenu.click();
  await page.getByRole('link', { name: label, exact: true }).click();
}
