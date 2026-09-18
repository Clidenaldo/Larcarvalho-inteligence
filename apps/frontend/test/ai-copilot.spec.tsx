// @vitest-environment jsdom
import type { Permission } from '@larcarvalho/shared';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AiCopilot } from '../src/components/ai-copilot';
import { deriveAiContext } from '../src/lib/ai-context';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function chatResponse(summary: string) {
  return {
    provider: 'mock',
    response: {
      attentionPoints: [],
      draft: null,
      facts: ['Lead: João Silva'],
      missingInformation: [],
      sources: [{ kind: 'Lead', label: 'Lead — João' }],
      suggestedActions: [],
      summary,
    },
  };
}

function stubFetch(handler: (url: string) => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) =>
      handler(typeof input === 'string' ? input : String(input)),
    ),
  );
}

function okStatus() {
  return new Response(
    JSON.stringify({
      config: {
        enabled: true,
        enabledResources: ['lead_analysis'],
        maxOutputTokens: 1200,
        model: 'larcarvalho-copilot-v1',
        provider: 'mock',
        providerConfigured: false,
        timeoutMs: 15000,
      },
      message: 'Inteligência Artificial ainda não configurada.',
      ready: false,
    }),
    { status: 200 },
  );
}

describe('ai copilot', () => {
  it('derives minimal route context without record payloads', () => {
    expect(deriveAiContext('/dashboard/crm/leads/abc-123')).toEqual({
      id: 'abc-123',
      label: 'Lead',
      type: 'LEAD',
    });
    expect(deriveAiContext('/dashboard/clientes/cli-456')).toEqual({
      id: 'cli-456',
      label: 'Cliente',
      type: 'LEAD',
    });
    expect(deriveAiContext('/simulacoes/sim-1')).toEqual({
      id: 'sim-1',
      label: 'Simulação',
      type: 'SIMULATION',
    });
    expect(deriveAiContext('/dashboard/comparador')).toEqual({
      label: 'Comparador',
      type: 'COMPARATOR',
    });
    expect(deriveAiContext('/propostas/prop-9')).toEqual({
      id: 'prop-9',
      label: 'Proposta',
      type: 'PROPOSAL',
    });
    expect(deriveAiContext('/dashboard')).toEqual({
      label: 'Painel',
      type: 'DASHBOARD',
    });
    expect(deriveAiContext('/dashboard/base-conhecimento')).toEqual({
      label: 'Base de conhecimento',
      type: 'KNOWLEDGE',
    });
    expect(
      deriveAiContext('/dashboard/base-conhecimento/11111111-1111-4111-8111-111111111111'),
    ).toEqual({
      label: 'Base de conhecimento',
      type: 'KNOWLEDGE',
    });
  });

  it('links grounded knowledge sources to the document', async () => {
    const user = userEvent.setup();
    stubFetch((url) =>
      url.endsWith('/api/ai/chat')
        ? new Response(
            JSON.stringify({
              provider: 'mock',
              response: {
                attentionPoints: [],
                draft: null,
                facts: ['Evidência: A contemplação ocorre por sorteio.'],
                grounded: true,
                missingInformation: [],
                sources: [
                  {
                    kind: 'KnowledgeDocument',
                    label: 'Regulamento de imóveis',
                    documentId: '11111111-1111-4111-8111-111111111111',
                  },
                ],
                suggestedActions: [],
                summary: 'Resposta fundamentada',
              },
            }),
            { status: 200 },
          )
        : okStatus(),
    );
    const permissions: readonly Permission[] = ['ai.use'];
    render(
      <AiCopilot
        contextLabel="Base de conhecimento"
        contextType="KNOWLEDGE"
        permissions={permissions}
      />,
    );
    await user.click(screen.getByLabelText('Abrir Larcarvalho AI'));
    await user.click(await screen.findByText('Consultar a base'));
    const link = await screen.findByRole('link', {
      name: 'Regulamento de imóveis',
    });
    expect(link.getAttribute('href')).toBe(
      '/dashboard/base-conhecimento/11111111-1111-4111-8111-111111111111',
    );
  });

  it('stays hidden without ai.use', () => {
    const permissions: readonly Permission[] = ['dashboard.read'];
    render(
      <AiCopilot contextLabel="Lead" contextType="LEAD" permissions={permissions} />,
    );
    expect(screen.queryByLabelText('Abrir Larcarvalho AI')).toBeNull();
  });

  it('opens the drawer with context and shortcuts', async () => {
    const user = userEvent.setup();
    stubFetch(() => okStatus());
    const permissions: readonly Permission[] = ['ai.use'];
    render(
      <AiCopilot
        contextId="lead-1"
        contextLabel="Lead"
        contextType="LEAD"
        permissions={permissions}
      />,
    );
    await user.click(screen.getByLabelText('Abrir Larcarvalho AI'));
    expect(await screen.findByText('Copiloto Comercial')).toBeTruthy();
    expect(screen.getByText('Contexto atual: Lead')).toBeTruthy();
    expect(screen.getByText('Analisar cliente')).toBeTruthy();
    expect(screen.getByText('Preparar follow-up')).toBeTruthy();
  });

  it('sends a question and renders structured facts with sources', async () => {
    const user = userEvent.setup();
    stubFetch((url) =>
      url.endsWith('/api/ai/chat')
        ? new Response(JSON.stringify(chatResponse('Resumo do cliente')), { status: 200 })
        : okStatus(),
    );
    const permissions: readonly Permission[] = ['ai.use'];
    render(
      <AiCopilot
        contextId="lead-1"
        contextLabel="Lead"
        contextType="LEAD"
        permissions={permissions}
      />,
    );
    await user.click(screen.getByLabelText('Abrir Larcarvalho AI'));
    await user.click(await screen.findByText('Analisar cliente'));
    expect(await screen.findByText('Resumo do cliente')).toBeTruthy();
    expect(screen.getByText('Lead: João Silva')).toBeTruthy();
    expect(screen.getByText(/Fontes:/)).toBeTruthy();
  });

  it('shows a permission message without stack trace on 403', async () => {
    const user = userEvent.setup();
    stubFetch((url) =>
      url.endsWith('/api/ai/chat')
        ? new Response(JSON.stringify({ error: { message: 'x' } }), { status: 403 })
        : okStatus(),
    );
    const permissions: readonly Permission[] = ['ai.use'];
    render(
      <AiCopilot
        contextLabel="Geral"
        contextType="GENERAL"
        permissions={permissions}
      />,
    );
    await user.click(screen.getByLabelText('Abrir Larcarvalho AI'));
    await user.click(await screen.findByText('Resumir meus leads'));
    await waitFor(() => {
      expect(
        screen.getByText('Você não tem permissão para usar este recurso da IA.'),
      ).toBeTruthy();
    });
  });

  it('shows a timeout message on 504', async () => {
    const user = userEvent.setup();
    stubFetch((url) =>
      url.endsWith('/api/ai/chat')
        ? new Response('{}', { status: 504 })
        : okStatus(),
    );
    const permissions: readonly Permission[] = ['ai.use'];
    render(
      <AiCopilot
        contextLabel="Geral"
        contextType="GENERAL"
        permissions={permissions}
      />,
    );
    await user.click(screen.getByLabelText('Abrir Larcarvalho AI'));
    await user.click(await screen.findByText('Resumir meus leads'));
    await waitFor(() => {
      expect(
        screen.getByText('Tempo esgotado. Tente novamente com uma pergunta mais curta.'),
      ).toBeTruthy();
    });
  });

  it('clears the conversation when the context changes', async () => {
    const user = userEvent.setup();
    stubFetch((url) =>
      url.endsWith('/api/ai/chat')
        ? new Response(JSON.stringify(chatResponse('Resumo')), { status: 200 })
        : okStatus(),
    );
    const permissions: readonly Permission[] = ['ai.use'];
    const view = render(
      <AiCopilot
        contextId="lead-1"
        contextLabel="Lead"
        contextType="LEAD"
        permissions={permissions}
      />,
    );
    await user.click(screen.getByLabelText('Abrir Larcarvalho AI'));
    await user.click(await screen.findByText('Analisar cliente'));
    expect(await screen.findByText('Resumo')).toBeTruthy();
    view.rerender(
      <AiCopilot
        contextId="lead-2"
        contextLabel="Lead"
        contextType="LEAD"
        permissions={permissions}
      />,
    );
    expect(screen.queryByText('Resumo')).toBeNull();
  });
});
