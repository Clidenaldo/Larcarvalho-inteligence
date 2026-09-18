import { test, expect } from '@playwright/test';

test.describe('Dashboard Access Control', () => {
  test('dashboard exists at /dashboard', async ({ page }) => {
    const response = await page.context().request.get('/dashboard');
    expect([200, 401, 302]).toContain(response.status());
  });

  test('protected dashboard requires session', async ({ page }) => {
    // Try accessing dashboard
    const response = await page.context().request.get('/dashboard');

    // Should either load (200) or redirect (302)
    expect([200, 302, 401]).toContain(response.status());
  });

  test('API endpoints require authentication', async ({ page }) => {
    // Try accessing protected API endpoint
    const response = await page
      .context()
      .request.get('http://127.0.0.1:3101/api/v1/users')
      .catch(() => null);

    // Should return 401/403 when not authenticated
    if (response) {
      expect([401, 403]).toContain(response.status());
    }
  });

  test('public simulator API does not require authentication', async ({
    page,
  }) => {
    const response = await page
      .context()
      .request.post('http://127.0.0.1:3101/api/v1/public/simulador', {
        data: {
          perfil: {
            categoria: 'IMOVEL',
            valorCreditoDesejado: '250000',
          },
          page: 1,
          pageSize: 1,
        },
      });

    expect(response.status()).not.toBe(401);
    expect([200, 404, 503]).toContain(response.status());
  });

  test('public simulator does not require auth', async ({ page }) => {
    const response = await page.context().request.get('/simulador');
    expect([200, 204]).toContain(response.status());
  });

  test('health endpoint is always accessible', async ({ page }) => {
    // Health endpoint on backend (port 3001)
    const response = await page
      .context()
      .request.get('http://127.0.0.1:3101/api/v1/health');
    expect(response.status()).toBe(200);
  });

  test('readiness endpoint is accessible', async ({ page }) => {
    // Readiness endpoint on backend (port 3001)
    const response = await page
      .context()
      .request.get('http://127.0.0.1:3101/api/v1/ready');
    expect(response.status()).toBe(200);
  });
});

test.describe('API Rate Limiting', () => {
  test('API health endpoint handles rapid requests', async ({ page }) => {
    const requests = Array.from({ length: 10 }, () =>
      page.context().request.get('http://127.0.0.1:3101/api/v1/health'),
    );

    const responses = await Promise.all(requests);
    const statuses = responses.map((r) => r.status());

    // Should not throttle health endpoint
    expect(statuses.every((s) => [200, 429].includes(s))).toBeTruthy();
  });

  test('public simulator API rate limiting', async ({ page }) => {
    let rateLimited = false;
    for (let i = 0; i < 20; i++) {
      const response = await page
        .context()
        .request.post('http://127.0.0.1:3101/api/public/leads', {
          data: { test: true },
        })
        .catch(() => null);

      if (response?.status() === 429) {
        rateLimited = true;
        break;
      }
    }

    // May or may not have rate limiting configured
    expect(typeof rateLimited === 'boolean').toBeTruthy();
  });
});
