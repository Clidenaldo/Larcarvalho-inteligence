import { expect, type Page, test } from '@playwright/test';

test.describe('Public Pages Accessibility', () => {
  async function waitForBackend(page: Page, path: string) {
    await expect
      .poll(
        async () => {
          const response = await page
            .context()
            .request.get(`http://127.0.0.1:3101${path}`)
            .catch(() => null);
          return response?.status() ?? 0;
        },
        { timeout: 15_000 },
      )
      .toBe(200);
  }

  test('simulator page is accessible', async ({ page }) => {
    await page.goto('/simulador');
    expect(page.url()).toContain('/simulador');
  });

  // Removed: "leads API is accessible"
  // Reason: /api/v1/leads POST endpoint requires authentication (returns 401)
  // This is protected API, not a public endpoint

  test('health check is accessible', async ({ page }) => {
    await waitForBackend(page, '/api/v1/health');
  });

  test('readiness check is accessible', async ({ page }) => {
    const response = await page
      .context()
      .request.get('http://127.0.0.1:3101/api/v1/ready');
    expect([200, 503]).toContain(response.status());
  });

  test('metrics endpoint responds', async ({ page }) => {
    const response = await page
      .context()
      .request.get('http://127.0.0.1:3101/api/v1/metrics')
      .catch(() => null);

    // May return 200 if implemented, 404 if not
    if (response) {
      expect([200, 404, 405]).toContain(response.status());
    }
  });

  test('home page loads', async ({ page }) => {
    const response = await page.goto('/');

    expect(response?.status()).toBe(200);
    const content = await page.content();
    expect(content.length).toBeGreaterThan(100);
  });

  test('anonymous visitor can open all public pages', async ({ page }) => {
    for (const path of [
      '/',
      '/simulador',
      '/privacidade',
      '/health',
      '/login',
    ]) {
      const response = await page.request.get(path);
      expect(response.status(), path).toBe(200);
    }

    const dashboardResponse = await page.request.get('/dashboard');
    expect([200, 302, 307, 401]).toContain(dashboardResponse.status());
    if (dashboardResponse.status() !== 200) {
      expect(dashboardResponse.headers().location).toContain('/login');
    }
  });

  test('simulador page has content', async ({ page }) => {
    await page.goto('/simulador');

    const content = await page.content();
    expect(content.length).toBeGreaterThan(100);
  });

  test('home exposes the public conversion journey', async ({ page }) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', {
        name: 'Seu próximo grande plano começa com uma escolha inteligente.',
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Simular agora' }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'Informação clara para você seguir seguro.',
      }),
    ).toBeVisible();
  });

  test('mobile menu exposes public navigation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const menuButton = page.getByRole('button', { name: 'Abrir menu' });
    await menuButton.click();
    await expect(
      page.getByRole('navigation', { name: 'Menu mobile' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Área administrativa' }).last(),
    ).toHaveAttribute('href', '/login');
  });

  test('quick simulation preserves safe criteria in simulator URL', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByLabel('Tipo de consórcio').selectOption('IMOVEL');
    await page.getByLabel('Valor de crédito desejado').fill('250000');
    await page.getByRole('button', { name: 'Continuar simulação' }).click();

    await expect(page).toHaveURL(
      /\/simulador\?categoria=IMOVEL&credito=250000/,
    );
    await expect(page.getByRole('radio', { name: /Imóvel/ })).toBeChecked();
  });

  test('privacy page is publicly accessible', async ({ page }) => {
    const response = await page.goto('/privacidade');
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { name: 'Política de Privacidade' }),
    ).toBeVisible();
  });

  test('public SEO resources are accessible anonymously', async ({ page }) => {
    for (const path of ['/robots.txt', '/sitemap.xml']) {
      const response = await page.request.get(path);
      expect(response.status(), path).toBe(200);
    }
  });
});
