import { expect, test } from '@playwright/test';
import { commercialE2e } from './commercial-fixture';

test('design system supports keyboard, brand contrast and responsive simulation', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(commercialE2e.email);
  await page.locator('input[type="password"]').fill(commercialE2e.password);
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 15_000 });
  await expect(
    page.getByRole('navigation', { name: 'Caminho da página' }),
  ).toBeVisible();
  await page.goto('/simulacoes/nova');
  const skip = page.getByRole('link', { name: 'Ir para o conteúdo' });
  await skip.focus();
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await page.locator('input[name="category"]').first().focus();
  await expect(page.locator('input[name="category"]').first()).toBeFocused();
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasOverflow).toBe(false);
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/i);
  const contrast = await page.evaluate(() => {
    const rgb = getComputedStyle(
      document.querySelector('button[type="submit"]')!,
    )
      .backgroundColor.match(/\d+/g)!
      .slice(0, 3)
      .map(Number);
    const luminance = rgb.map((v) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return (
      1.05 /
      (0.2126 * luminance[0]! +
        0.7152 * luminance[1]! +
        0.0722 * luminance[2]! +
        0.05)
    );
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  const menu = page.getByRole('button', { name: 'Abrir menu' });
  if (await menu.isVisible()) {
    await menu.click();
    await expect(
      page.getByRole('dialog', { name: 'Menu de navegação' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('dialog', { name: 'Menu de navegação' }),
    ).toHaveCount(0);
    await expect(menu).toBeFocused();
  }
  await page.goto('/dashboard/administradoras');
  await expect(
    page.getByRole('heading', { name: 'Administradoras cadastradas' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
});
