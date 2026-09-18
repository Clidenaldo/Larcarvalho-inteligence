import type { AuthResponse } from '@larcarvalho/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../src/app/api/data-quality/[...path]/route';
import { visibleNavigation } from '../src/components/app-shell';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('data quality frontend and BFF', () => {
  const identity = (
    permissions: AuthResponse['permissions'],
  ): AuthResponse => ({
    permissions,
    user: {
      id: '3343309c-541f-4457-8d6b-a42f7e02bd9c',
      nome: 'Usuário',
      email: 'user@example.com',
      role: 'GESTOR',
    },
  });
  it('shows navigation only with read capability', () => {
    const labels = (permissions: AuthResponse['permissions']) =>
      visibleNavigation(identity(permissions)).flatMap((group) =>
        group.items.map((item) => item.label),
      );
    expect(labels(['data_quality.read'])).toContain('Qualidade dos Dados');
    expect(labels([])).not.toContain('Qualidade dos Dados');
  });
  it('forwards paginated filters and session through the BFF', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    const backendFetch = vi.fn(async () =>
      Response.json({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
      }),
    );
    vi.stubGlobal('fetch', backendFetch);
    const request = new Request(
      'http://frontend.test/api/data-quality/issues?status=OPEN&grupoId=3343309c-541f-4457-8d6b-a42f7e02bd9c',
      { headers: { cookie: 'larcarvalho_session=opaque' } },
    );
    const response = await GET(request, {
      params: Promise.resolve({ path: ['issues'] }),
    });
    expect(response.status).toBe(200);
    expect(backendFetch.mock.calls[0]?.[0]).toContain(
      '/api/v1/data-quality/issues?status=OPEN',
    );
    expect(
      new Headers((backendFetch.mock.calls[0]?.[1] as RequestInit).headers).get(
        'cookie',
      ),
    ).toBe('larcarvalho_session=opaque');
  });
  it('forwards scanner command without inventing progress', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    const backendFetch = vi.fn(async () =>
      Response.json({
        registrosAvaliados: 10,
        issuesNovas: 1,
        issuesExistentes: 2,
        resolvidasAutomaticamente: 0,
      }),
    );
    vi.stubGlobal('fetch', backendFetch);
    const response = await POST(
      new Request('http://frontend.test/api/data-quality/scan', {
        method: 'POST',
      }),
      { params: Promise.resolve({ path: ['scan'] }) },
    );
    expect(response.status).toBe(200);
    expect(backendFetch.mock.calls[0]?.[0]).toBe(
      'http://backend.test/api/v1/data-quality/scan',
    );
  });
});
