import { describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';

import { hasPermission } from '../src/core/auth/rbac.js';
import type { ConnectorContext } from '../src/modules/integrations/integration-connector.js';
import { MockIntegrationConnector } from '../src/modules/integrations/mock.connector.js';
import {
  assertSafeExternalUrl,
  isBlockedAddress,
} from '../src/modules/integrations/network-policy.js';
import { RestIntegrationConnector } from '../src/modules/integrations/rest.connector.js';

const context: ConnectorContext = {
  requestId: 'request-1',
  secretRef: null,
  resolveSecret: () => undefined,
};
const restConfig = {
  baseUrl: 'http://127.0.0.1:4010/canonical',
  authType: 'NONE' as const,
  paginationType: 'NONE' as const,
  mappingProfile: 'CANONICAL_V1' as const,
  capabilities: ['STATUS' as const],
  timeoutMs: 1_000,
  maxResponseBytes: 2_048,
  maxRetries: 1,
};

describe('integration connectors', () => {
  it('blocks private, loopback, link-local and metadata destinations', async () => {
    for (const address of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.2',
      '169.254.169.254',
      '::1',
      'fd00::1',
    ])
      expect(isBlockedAddress(address)).toBe(true);
    await expect(
      assertSafeExternalUrl(restConfig.baseUrl, {
        allowedHosts: new Set(['127.0.0.1']),
        allowPrivateAddresses: false,
      }),
    ).rejects.toMatchObject({ code: 'PRIVATE_ADDRESS_BLOCKED' });
  });

  it('allows a controlled local REST endpoint only through test policy', async () => {
    await expect(
      assertSafeExternalUrl(restConfig.baseUrl, {
        allowedHosts: new Set(['127.0.0.1']),
        allowPrivateAddresses: true,
      }),
    ).resolves.toBeInstanceOf(URL);
  });

  it('retries transient status with bounded backoff and parses canonical records', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({
          records: [
            { entityType: 'GRUPO', externalId: 'g-1', data: { codigo: '1' } },
          ],
        }),
      );
    const connector = new RestIntegrationConnector(
      { allowedHosts: new Set(['127.0.0.1']), allowPrivateAddresses: true },
      fetcher,
      async () => undefined,
    );
    const result = await connector.fetchRecords(restConfig, context);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ received: 1, valid: 1, invalid: 0 });
  });

  it('connects to an explicitly controlled local REST endpoint in test mode', async () => {
    const server = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          records: [
            {
              entityType: 'PRODUTO',
              externalId: 'produto-local-1',
              data: { nome: 'Teste' },
            },
          ],
        }),
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    try {
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('Porta indisponÃ­vel');
      const connector = new RestIntegrationConnector({
        allowedHosts: new Set(['127.0.0.1']),
        allowPrivateAddresses: true,
      });
      const config = {
        ...restConfig,
        baseUrl: `http://127.0.0.1:${address.port}/canonical`,
        maxRetries: 0,
      };
      await expect(
        connector.testConnection(config, context),
      ).resolves.toMatchObject({
        sucesso: true,
      });
      await expect(
        connector.fetchRecords(config, context),
      ).resolves.toMatchObject({
        received: 1,
        valid: 1,
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('does not follow redirects and enforces response size', async () => {
    const redirect = new RestIntegrationConnector(
      { allowedHosts: new Set(['127.0.0.1']), allowPrivateAddresses: true },
      vi
        .fn()
        .mockResolvedValue(new Response('', { status: 302 })) as typeof fetch,
    );
    await expect(
      redirect.fetchRecords(restConfig, context),
    ).rejects.toMatchObject({
      code: 'REDIRECT_BLOCKED',
    });

    const oversized = new RestIntegrationConnector(
      { allowedHosts: new Set(['127.0.0.1']), allowPrivateAddresses: true },
      vi.fn().mockResolvedValue(
        new Response('x'.repeat(3_000), {
          headers: { 'content-length': '3000' },
        }),
      ) as typeof fetch,
    );
    await expect(
      oversized.fetchRecords(restConfig, context),
    ).rejects.toMatchObject({
      code: 'RESPONSE_TOO_LARGE',
    });
  });

  it('provides deterministic controlled mock success and partial scenarios', async () => {
    const connector = new MockIntegrationConnector();
    await expect(
      connector.fetchRecords({ scenario: 'SUCCESS', recordCount: 3 }, context),
    ).resolves.toMatchObject({ received: 3, valid: 3, invalid: 0 });
    await expect(
      connector.fetchRecords({ scenario: 'PARTIAL', recordCount: 3 }, context),
    ).resolves.toMatchObject({ received: 3, valid: 2, invalid: 1 });
  });
});

describe('integration RBAC', () => {
  it('grants technical access by operational responsibility', () => {
    for (const permission of [
      'integrations.read',
      'integrations.create',
      'integrations.update',
      'integrations.execute',
      'integrations.logs',
      'integrations.test_connection',
      'integrations.pause',
    ] as const) {
      expect(hasPermission('SUPER_ADMIN', permission)).toBe(true);
      expect(hasPermission('ADMIN', permission)).toBe(true);
      expect(hasPermission('VENDEDOR', permission)).toBe(false);
    }
    expect(hasPermission('GESTOR', 'integrations.execute')).toBe(true);
    expect(hasPermission('GESTOR', 'integrations.create')).toBe(false);
    expect(hasPermission('OPERADOR', 'integrations.logs')).toBe(true);
    expect(hasPermission('OPERADOR', 'integrations.test_connection')).toBe(
      false,
    );
  });
});


