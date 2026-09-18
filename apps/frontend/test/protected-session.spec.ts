import { afterEach, describe, expect, it, vi } from 'vitest';

const { cookies } = vi.hoisted(() => ({
  cookies: vi.fn(async () => ({
    toString: () => 'larcarvalho_session=opaque',
  })),
}));

vi.mock('next/headers', () => ({ cookies }));

import { getCurrentUser } from '../src/services/api/auth';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('server-side protected session', () => {
  it('returns null when the backend rejects the session', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 401 })),
    );

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it('validates the user and forwards cookies only on the server', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    const backendFetch = vi.fn(async () =>
      Response.json({
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
      }),
    );
    vi.stubGlobal('fetch', backendFetch);

    await expect(getCurrentUser()).resolves.toMatchObject({
      nome: 'Root',
      role: 'SUPER_ADMIN',
    });
    expect(backendFetch).toHaveBeenCalledWith(
      'http://backend.test/api/v1/auth/me',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.objectContaining({
          cookie: 'larcarvalho_session=opaque',
        }),
      }),
    );
  });
});
