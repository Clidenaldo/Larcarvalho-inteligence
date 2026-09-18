import type { AuthResponse } from '@larcarvalho/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from '../src/app/api/simulations/[[...path]]/route';
import { visibleNavigation } from '../src/components/app-shell';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const identity = (permissions: AuthResponse['permissions']): AuthResponse => ({
  permissions,
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    nome: 'Vendedora Teste',
    email: 'vendedora@example.com',
    role: 'VENDEDOR',
  },
});

describe('phase 20 commercial frontend', () => {
  it('exposes the simulation, proposal and commercial configuration journeys', () => {
    const groups = visibleNavigation(
      identity([
        'simulations.create',
        'proposals.read_own',
        'commercial_config.read',
      ]),
    );
    const links = groups.flatMap((group) =>
      group.items.map((item) => item.href),
    );
    expect(links).toEqual(
      expect.arrayContaining([
        '/simulacoes/nova',
        '/propostas',
        '/configuracoes/comercial',
      ]),
    );
  });

  it('forwards simulation creation through the authenticated BFF', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    const backendFetch = vi.fn(async () =>
      Response.json({ id: 'simulation-id' }, { status: 201 }),
    );
    vi.stubGlobal('fetch', backendFetch);
    const request = new Request('http://frontend.test/api/simulations', {
      method: 'POST',
      headers: {
        cookie: 'larcarvalho_session=opaque',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        category: 'IMOVEL',
        creditMode: 'CONTRACTED_CREDIT',
        requestedCredit: '200000',
        desiredTermMonths: 120,
      }),
    });
    const response = await POST(request, {
      params: Promise.resolve({ path: undefined }),
    });
    expect(response.status).toBe(201);
    expect(backendFetch.mock.calls[0]?.[0]).toBe(
      'http://backend.test/api/v1/simulations',
    );
  });
});
