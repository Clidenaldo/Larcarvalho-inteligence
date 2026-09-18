import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from '../src/app/api/users/route';
import { GET as administradorasGet } from '../src/app/api/administradoras/route';
import { GET as assembleiasGet } from '../src/app/api/assembleias/route';
import { POST as changePassword } from '../src/app/api/auth/change-password/route';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('identity BFF proxy', () => {
  it('forwards pagination and the HttpOnly cookie for users', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    const backendFetch = vi.fn(async () =>
      Response.json({
        items: [],
        page: 2,
        pageSize: 20,
        total: 0,
        totalPages: 0,
      }),
    );
    vi.stubGlobal('fetch', backendFetch);
    const response = await GET(
      new Request('http://frontend.test/api/users?page=2&pageSize=20', {
        headers: { cookie: 'larcarvalho_session=opaque' },
      }),
    );
    expect(response.status).toBe(200);
    expect(backendFetch.mock.calls[0]?.[0]).toBe(
      'http://backend.test/api/v1/users?page=2&pageSize=20',
    );
    const options = backendFetch.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(options.headers).get('cookie')).toBe(
      'larcarvalho_session=opaque',
    );
  });

  it('forwards user creation without retaining the password', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    const backendFetch = vi.fn(async () =>
      Response.json(
        { id: '3343309c-541f-4457-8d6b-a42f7e02bd9c' },
        { status: 201 },
      ),
    );
    vi.stubGlobal('fetch', backendFetch);
    const body = JSON.stringify({
      email: 'new@example.com',
      password: 'frase senha segura',
    });
    const response = await POST(
      new Request('http://frontend.test/api/users', { body, method: 'POST' }),
    );
    expect(response.status).toBe(201);
    expect((backendFetch.mock.calls[0]?.[1] as RequestInit).body).toBe(body);
    expect(await response.text()).not.toContain('frase senha segura');
  });

  it('forwards administradora filters and the HttpOnly cookie', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    const backendFetch = vi.fn(async () => Response.json({ items: [] }));
    vi.stubGlobal('fetch', backendFetch);
    await administradorasGet(
      new Request(
        'http://frontend.test/api/administradoras?search=consorcio&status=ativas',
        { headers: { cookie: 'larcarvalho_session=opaque' } },
      ),
    );
    expect(backendFetch.mock.calls[0]?.[0]).toBe(
      'http://backend.test/api/v1/administradoras?search=consorcio&status=ativas',
    );
  });

  it('forwards historical filters through the BFF', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    const backendFetch = vi.fn(async () => Response.json({ items: [] }));
    vi.stubGlobal('fetch', backendFetch);
    await assembleiasGet(
      new Request(
        'http://frontend.test/api/assembleias?grupoId=3343309c-541f-4457-8d6b-a42f7e02bd9c&dataInicio=2026-09-01',
        { headers: { cookie: 'larcarvalho_session=opaque' } },
      ),
    );
    expect(backendFetch.mock.calls[0]?.[0]).toContain(
      '/api/v1/assembleias?grupoId=',
    );
  });

  it('proxies password change and preserves a no-content response', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    const response = await changePassword(
      new Request('http://frontend.test/api/auth/change-password', {
        body: JSON.stringify({
          currentPassword: 'senha atual longa',
          newPassword: 'nova senha longa',
        }),
        method: 'POST',
      }),
    );
    expect(response.status).toBe(204);
  });
});
