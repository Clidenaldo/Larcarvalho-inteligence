import type { AuthResponse, Integration } from '@larcarvalho/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { IntegrationActions } from '../src/components/integration-actions';
import { IntegrationCreateForm } from '../src/components/integration-create-form';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const identity: AuthResponse = {
  permissions: [
    'integrations.read',
    'integrations.create',
    'integrations.execute',
    'integrations.test_connection',
    'integrations.pause',
  ],
  user: {
    id: '3343309c-541f-4457-8d6b-a42f7e02bd9c',
    email: 'admin@example.com',
    nome: 'Admin',
    role: 'SUPER_ADMIN',
  },
};

const integration: Integration = {
  id: '938a0269-cbfe-4019-a3f3-a3cf48c74415',
  administradoraId: null,
  fonteDadosId: null,
  nome: 'Connector de teste',
  tipo: 'MOCK',
  status: 'ATIVA',
  configuracao: { scenario: 'SUCCESS', recordCount: 3 },
  configurado: true,
  secretRef: null,
  frequencia: null,
  ultimoSucessoEm: null,
  ultimaTentativaEm: null,
  proximaExecucaoEm: null,
  createdAt: '2026-09-02T12:00:00.000Z',
  updatedAt: '2026-09-02T12:00:00.000Z',
  administradora: null,
  fonteDados: null,
};

describe('integrations administration UI', () => {
  it('renders controlled connector creation without a secret value field', () => {
    const html = renderToStaticMarkup(
      <IntegrationCreateForm identity={identity} />,
    );
    expect(html).toContain('Nova integração');
    expect(html).toContain('Mock controlado');
    expect(html).not.toContain('name="token"');
    expect(html).not.toContain('name="password"');
  });

  it('renders authorized connection, execution and pause actions', () => {
    const html = renderToStaticMarkup(
      <IntegrationActions identity={identity} integration={integration} />,
    );
    expect(html).toContain('Testar conexão');
    expect(html).toContain('Executar agora');
    expect(html).toContain('Pausar');
  });
});
