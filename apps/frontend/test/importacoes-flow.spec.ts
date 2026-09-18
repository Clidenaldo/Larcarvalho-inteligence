import type { AuthResponse } from '@larcarvalho/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST as proxyImport } from '../src/app/api/importacoes/[...path]/route';
import { visibleNavigation } from '../src/components/app-shell';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('import frontend and streaming BFF', () => {
  it('shows Importações only with read capability', () => {
    const identity = (
      permissions: AuthResponse['permissions'],
    ): AuthResponse => ({
      permissions,
      user: {
        id: '3343309c-541f-4457-8d6b-a42f7e02bd9c',
        nome: 'Operador',
        email: 'operator@example.com',
        role: 'OPERADOR',
      },
    });
    const labels = (permissions: AuthResponse['permissions']) =>
      visibleNavigation(identity(permissions)).flatMap((group) =>
        group.items.map((item) => item.label),
      );
    expect(labels(['importacoes.read'])).toContain('Importações');
    expect(labels([])).not.toContain('Importações');
    expect(labels(['tabelas_comerciais.read'])).toContain('Tabelas comerciais');
  });
  it('streams multipart upload through the BFF with cookie and content type', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    const backendFetch = vi.fn(async () =>
      Response.json(
        { id: '3343309c-541f-4457-8d6b-a42f7e02bd9c' },
        { status: 201 },
      ),
    );
    vi.stubGlobal('fetch', backendFetch);
    const form = new FormData();
    form.set('tipoImportacao', 'ADMINISTRADORAS');
    form.set(
      'arquivo',
      new File(['nome\nTeste\n'], 'dados.csv', { type: 'text/csv' }),
    );
    const request = new Request('http://frontend.test/api/importacoes/upload', {
      method: 'POST',
      body: form,
      headers: {
        cookie: 'larcarvalho_session=opaque',
        origin: 'http://frontend.test',
      },
    });
    const response = await proxyImport(request, {
      params: Promise.resolve({ path: ['upload'] }),
    });
    expect(response.status).toBe(201);
    const [url, options] = backendFetch.mock.calls[0]!;
    expect(url).toBe('http://backend.test/api/v1/importacoes/upload');
    const init = options as RequestInit & { duplex?: string };
    expect(init.body).toBeInstanceOf(ReadableStream);
    expect(init.duplex).toBe('half');
    const headers = new Headers(init.headers);
    expect(headers.get('cookie')).toBe('larcarvalho_session=opaque');
    expect(headers.get('content-type')).toContain(
      'multipart/form-data; boundary=',
    );
  });
});
