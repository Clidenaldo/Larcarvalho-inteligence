import { afterEach, describe, expect, it, vi } from 'vitest';

import * as accountRoute from '../src/app/api/account/route';
import * as appearanceRoute from '../src/app/api/appearance/route';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('phase 21 experience frontend BFF', () => {
  it('forwards appearance updates through the authenticated proxy', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    const backendFetch = vi.fn(async () =>
      Response.json({ commercialName: 'Larcarvalho Consórcios' }),
    );
    vi.stubGlobal('fetch', backendFetch);
    const request = new Request('http://frontend.test/api/appearance', {
      body: JSON.stringify({ commercialName: 'Larcarvalho Consórcios' }),
      headers: {
        cookie: 'larcarvalho_session=opaque',
        'content-type': 'application/json',
      },
      method: 'PATCH',
    });
    const response = await appearanceRoute.PATCH(request);
    expect(response.status).toBe(200);
    expect(backendFetch.mock.calls[0]?.[0]).toBe(
      'http://backend.test/api/v1/appearance',
    );
  });

  it('forwards account reads without exposing another user path', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    const backendFetch = vi.fn(async () => Response.json({ id: 'own-user' }));
    vi.stubGlobal('fetch', backendFetch);
    const request = new Request('http://frontend.test/api/account', {
      headers: { cookie: 'larcarvalho_session=opaque' },
      method: 'GET',
    });
    const response = await accountRoute.GET(request);
    expect(response.status).toBe(200);
    expect(backendFetch.mock.calls[0]?.[0]).toBe(
      'http://backend.test/api/v1/account',
    );
  });
});
