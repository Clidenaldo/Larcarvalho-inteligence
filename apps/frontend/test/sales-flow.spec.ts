import { commissionDifference } from '../src/lib/commission-money';
import type { AuthResponse } from '@larcarvalho/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST as proxySales } from '../src/app/api/sales/[[...path]]/route';
import { POST as proxyCommissions } from '../src/app/api/commissions/[[...path]]/route';
import { PATCH as proxyContracts } from '../src/app/api/contracts/[[...path]]/route';
import { GET as proxyRules } from '../src/app/api/commission-rules/[[...path]]/route';
import { visibleNavigation } from '../src/components/app-shell';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function identity(permissions: AuthResponse['permissions']): AuthResponse {
  return {
    permissions,
    user: {
      id: '3343309c-541f-4457-8d6b-a42f7e02bd9c',
      nome: 'Vendedor',
      email: 'seller@example.com',
      role: 'VENDEDOR',
    },
  };
}
function labels(permissions: AuthResponse['permissions']) {
  return visibleNavigation(identity(permissions)).flatMap((group) =>
    group.items.map((item) => item.label),
  );
}

describe('sales frontend navigation and BFF', () => {
  it('shows Vendas with sales read capability and hides without it', () => {
    expect(labels(['sales.read_own'])).toContain('Vendas');
    expect(labels(['sales.read_team'])).toContain('Vendas');
    expect(labels(['sales.read_all'])).toContain('Vendas');
    expect(labels([])).not.toContain('Vendas');
    expect(labels(['leads.read_own'])).not.toContain('Vendas');
  });
  it('shows Comissões only with commissions.read', () => {
    expect(labels(['commissions.read'])).toContain('Comissões');
    expect(labels(['sales.read_own'])).not.toContain('Comissões');
    expect(labels([])).not.toContain('Comissões');
  });
  it('proxies sale creation to the backend sales endpoint', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    const backendFetch = vi.fn(async () =>
      Response.json(
        { id: '3343309c-541f-4457-8d6b-a42f7e02bd9c' },
        { status: 201 },
      ),
    );
    vi.stubGlobal('fetch', backendFetch);
    const request = new Request('http://frontend.test/api/sales', {
      method: 'POST',
      body: JSON.stringify({
        proposalId: '3343309c-541f-4457-8d6b-a42f7e02bd9c',
        proposalItemId: '3343309c-541f-4457-8d6b-a42f7e02bd9c',
      }),
      headers: {
        cookie: 'larcarvalho_session=opaque',
        origin: 'http://frontend.test',
      },
    });
    const response = await proxySales(request, { params: Promise.resolve({}) });
    expect(response.status).toBe(201);
    const [url] = backendFetch.mock.calls[0]!;
    expect(url).toBe('http://backend.test/api/v1/sales');
  });
  it('proxies nested sale contract and commission actions', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.test');
    const backendFetch = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal('fetch', backendFetch);
    const commission = new Request(
      'http://frontend.test/api/commissions/abc/confirm',
      {
        method: 'POST',
        body: JSON.stringify({ valorConfirmado: '100.00' }),
        headers: {
          cookie: 'larcarvalho_session=opaque',
          origin: 'http://frontend.test',
        },
      },
    );
    await proxyCommissions(commission, {
      params: Promise.resolve({ path: ['abc', 'confirm'] }),
    });
    const contract = new Request('http://frontend.test/api/contracts/abc', {
      method: 'PATCH',
      body: JSON.stringify({ statusContrato: 'EMITIDO' }),
      headers: {
        cookie: 'larcarvalho_session=opaque',
        origin: 'http://frontend.test',
      },
    });
    await proxyContracts(contract, {
      params: Promise.resolve({ path: ['abc'] }),
    });
    const rules = new Request(
      'http://frontend.test/api/commission-rules?page=1',
      {
        headers: {
          cookie: 'larcarvalho_session=opaque',
          origin: 'http://frontend.test',
        },
      },
    );
    await proxyRules(rules, { params: Promise.resolve({}) });
    const urls = backendFetch.mock.calls.map((call) => call[0]);
    expect(urls).toContain(
      'http://backend.test/api/v1/commissions/abc/confirm',
    );
    expect(urls).toContain('http://backend.test/api/v1/contracts/abc');
    expect(urls).toContain(
      'http://backend.test/api/v1/commission-rules?page=1',
    );
  });
});

it('displays exact commission differences including negative and large amounts', () => {
  expect(commissionDifference('4850.00', '5000.00')).toBe('-150.00');
  expect(commissionDifference('90071992547409.93', '90071992547409.92')).toBe(
    '0.01',
  );
  expect(commissionDifference('0', '0.01')).toBe('-0.01');
  expect(commissionDifference('10.1', '10.10')).toBe('0.00');
});
