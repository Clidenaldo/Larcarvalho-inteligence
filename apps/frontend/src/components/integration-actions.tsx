'use client';

import {
  connectionTestResponseSchema,
  integrationRunSchema,
  integrationSchema,
  type AuthResponse,
  type Integration,
} from '@larcarvalho/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert } from './ui/alert';
import { Button } from './ui/button';

export function IntegrationActions({
  identity,
  integration,
}: {
  readonly identity: AuthResponse;
  readonly integration: Integration;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    tone: 'danger' | 'info' | 'success';
    text: string;
  } | null>(null);

  async function action(name: string, path: string, body?: unknown) {
    setBusy(name);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/integrations/${integration.id}/${path}`,
        {
          method: 'POST',
          ...(body
            ? {
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
              }
            : {}),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload?.error?.message ?? 'A operação não pôde ser concluída',
        );
      if (path === 'test-connection') {
        const result = connectionTestResponseSchema.parse(payload);
        setMessage({
          tone: result.sucesso ? 'success' : 'danger',
          text: `${result.mensagem} (${result.latenciaMs} ms)`,
        });
      } else if (path === 'execute') {
        const run = integrationRunSchema.parse(payload);
        setMessage({
          tone: run.status === 'FALHA' ? 'danger' : 'success',
          text: `Execução finalizada com status ${run.status}.`,
        });
      } else {
        integrationSchema.parse(payload);
        setMessage({ tone: 'success', text: 'Status atualizado.' });
      }
      router.refresh();
    } catch (error) {
      setMessage({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Falha inesperada',
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {identity.permissions.includes('integrations.test_connection') ? (
          <Button
            loading={busy === 'test'}
            onClick={() => action('test', 'test-connection')}
            variant="outline"
          >
            Testar conexão
          </Button>
        ) : null}
        {identity.permissions.includes('integrations.execute') ? (
          <Button
            disabled={integration.status !== 'ATIVA'}
            loading={busy === 'execute'}
            onClick={() =>
              action('execute', 'execute', {
                trigger: 'MANUAL',
                idempotencyKey: crypto.randomUUID(),
              })
            }
          >
            Executar agora
          </Button>
        ) : null}
        {identity.permissions.includes('integrations.pause') ? (
          <Button
            loading={busy === 'status'}
            onClick={() =>
              action(
                'status',
                integration.status === 'PAUSADA' ? 'resume' : 'pause',
              )
            }
            variant="secondary"
          >
            {integration.status === 'PAUSADA' ? 'Retomar' : 'Pausar'}
          </Button>
        ) : null}
      </div>
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
    </div>
  );
}
