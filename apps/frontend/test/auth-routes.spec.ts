import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST as login } from '../src/app/api/auth/login/route';
import { POST as logout } from '../src/app/api/auth/logout/route';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('authentication BFF routes', () => {
  it('forwards login and the HttpOnly session cookie without exposing a token', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    const backendFetch = vi.fn(async () =>
      Response.json(
        {
          permissions: [
            'users.read',
            'users.create',
            'users.update',
            'users.changeRole',
            'users.deactivate',
          ],
          user: {
            email: 'root@example.com',
            id: '3343309c-541f-4457-8d6b-a42f7e02bd9c',
            nome: 'Root',
            role: 'SUPER_ADMIN',
          },
        },
        {
          headers: {
            'set-cookie':
              'larcarvalho_session=opaque; Path=/; HttpOnly; SameSite=Strict',
          },
        },
      ),
    );
    vi.stubGlobal('fetch', backendFetch);

    const response = await login(
      new Request('http://frontend.test/api/auth/login', {
        body: JSON.stringify({
          email: 'root@example.com',
          password: 'frase senha segura',
        }),
        method: 'POST',
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(await response.text()).not.toContain('opaque');
    expect(backendFetch).toHaveBeenCalledWith(
      'http://backend.test/api/v1/auth/login',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('preserves a generic login error', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          {
            error: {
              code: 'UNAUTHORIZED',
              message: 'Credenciais inválidas',
              requestId: 'request-1',
            },
          },
          { status: 401 },
        ),
      ),
    );

    const response = await login(
      new Request('http://frontend.test/api/auth/login', {
        body: '{}',
        method: 'POST',
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: 'UNAUTHORIZED', message: 'Credenciais inválidas' },
    });
  });

  it('forwards the session on logout and returns cookie removal', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    const backendFetch = vi.fn(
      async () =>
        new Response(null, {
          headers: {
            'set-cookie':
              'larcarvalho_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict',
          },
          status: 204,
        }),
    );
    vi.stubGlobal('fetch', backendFetch);

    const response = await logout(
      new Request('http://frontend.test/api/auth/logout', {
        headers: { cookie: 'larcarvalho_session=opaque' },
        method: 'POST',
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(backendFetch).toHaveBeenCalledWith(
      'http://backend.test/api/v1/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
    const requestOptions = backendFetch.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(requestOptions.headers).get('cookie')).toBe(
      'larcarvalho_session=opaque',
    );
  });
});
