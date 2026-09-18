'use client';

import {
  createIntegrationRequestSchema,
  integrationSchema,
  type AuthResponse,
  type IntegrationConnectorType,
} from '@larcarvalho/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Field, Input, Select } from './ui/field';

const labels: Record<IntegrationConnectorType, string> = {
  MOCK: 'Mock controlado',
  REST_API: 'API REST',
  MANUAL_IMPORT: 'Importação manual',
  SOAP: 'SOAP (não configurado)',
  SFTP: 'SFTP (não configurado)',
  FILE_PULL: 'Download de arquivo (não configurado)',
  WEBHOOK: 'Webhook (não configurado)',
};

export function IntegrationCreateForm({
  identity,
}: {
  readonly identity: AuthResponse;
}) {
  const router = useRouter();
  const [type, setType] = useState<IntegrationConnectorType>('MOCK');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!identity.permissions.includes('integrations.create')) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const name = String(form.get('nome') ?? '');
    let input: unknown;
    if (type === 'MOCK') {
      input = {
        nome: name,
        tipo: type,
        configuracao: {
          scenario: String(form.get('scenario') ?? 'SUCCESS'),
          recordCount: Number(form.get('recordCount') ?? 3),
        },
      };
    } else if (type === 'REST_API') {
      const authType = String(form.get('authType') ?? 'NONE');
      input = {
        nome: name,
        tipo: type,
        secretRef:
          authType === 'BEARER_SECRET_REF'
            ? String(form.get('secretRef') ?? '')
            : null,
        configuracao: {
          baseUrl: String(form.get('baseUrl') ?? ''),
          authType,
          paginationType: 'NONE',
          mappingProfile: 'CANONICAL_V1',
          timeoutMs: 5_000,
          maxResponseBytes: 524_288,
          maxRetries: 1,
        },
      };
    } else if (type === 'MANUAL_IMPORT') {
      input = {
        nome: name,
        tipo: type,
        configuracao: { importacaoId: String(form.get('importacaoId') ?? '') },
      };
    } else input = { nome: name, tipo: type, configuracao: {} };

    const parsed = createIntegrationRequestSchema.safeParse(input);
    if (!parsed.success) {
      setMessage('Revise os campos da configuração.');
      setBusy(false);
      return;
    }
    try {
      const response = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload?.error?.message ?? 'Falha ao criar integração');
      integrationSchema.parse(payload);
      event.currentTarget.reset();
      setMessage('Integração cadastrada com segurança.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha inesperada');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <h3 className="font-semibold">Nova integração</h3>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Segredos nunca são enviados neste formulário; informe somente uma
        referência de ambiente.
      </p>
      <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={submit}>
        <Field helpKey="integration.name" label="Nome" required>
          <Input name="nome" required />
        </Field>
        <Field helpKey="integration.connector" label="Connector" required>
          <Select
            name="tipo"
            onChange={(event) =>
              setType(event.target.value as IntegrationConnectorType)
            }
            value={type}
          >
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        {type === 'MOCK' ? (
          <>
            <Field helpKey="integration.scenario" label="Cenário">
              <Select name="scenario">
                <option value="SUCCESS">Sucesso</option>
                <option value="PARTIAL">Sucesso parcial</option>
                <option value="FAILURE">Falha controlada</option>
              </Select>
            </Field>
            <Field helpKey="integration.count" label="Registros">
              <Input
                defaultValue="3"
                max="100"
                min="0"
                name="recordCount"
                type="number"
              />
            </Field>
          </>
        ) : null}
        {type === 'REST_API' ? (
          <>
            <Field
              helpKey="integration.url"
              label="URL autorizada"
              help="O host deve estar na allowlist do ambiente."
              required
            >
              <Input
                name="baseUrl"
                placeholder="https://api.fornecedor.tld/dados"
                required
                type="url"
              />
            </Field>
            <Field helpKey="integration.auth" label="Autenticação">
              <Select name="authType">
                <option value="NONE">Sem autenticação</option>
                <option value="BEARER_SECRET_REF">Bearer via secretRef</option>
              </Select>
            </Field>
            <Field
              helpKey="integration.secret"
              label="Referência do segredo"
              help="Exemplo: FORNECEDOR_API_PROD"
            >
              <Input name="secretRef" pattern="[A-Z][A-Z0-9_]*" />
            </Field>
          </>
        ) : null}
        {type === 'MANUAL_IMPORT' ? (
          <Field
            helpKey="integration.importId"
            label="ID da importação pronta"
            required
          >
            <Input name="importacaoId" required />
          </Field>
        ) : null}
        <div className="md:col-span-2">
          <Button loading={busy} type="submit">
            Criar integração
          </Button>
        </div>
      </form>
      {message ? (
        <div className="mt-4">
          <Alert>{message}</Alert>
        </div>
      ) : null}
    </Card>
  );
}
