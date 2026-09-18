'use client';

import type { AiStatusResponse } from '@larcarvalho/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { AiUsageDashboard } from './ai-usage-dashboard';
import { Alert } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Field, Input, Select } from './ui/field';

async function mutation(path: string, method: string, body: unknown) {
  const response = await fetch(path, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method,
  });
  if (!response.ok) {
    const payload = (await response.json()) as { error?: { message?: string } };
    throw new Error(payload.error?.message ?? 'Operação não concluída');
  }
  return response.json() as Promise<unknown>;
}

function numberOrNull(value: FormDataEntryValue | null): number | null {
  if (value === null || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

interface PricingRow {
  active: boolean;
  currency: string;
  id: string;
  inputPerMillionMicros: number;
  model: string;
  outputPerMillionMicros: number;
  provider: string;
}

interface ConnectionTest {
  capabilities: {
    embeddings: boolean;
    streaming: boolean;
    structuredOutput: boolean;
    toolCalling: boolean;
  } | null;
  configured: boolean;
  latencyMs: number | null;
  model: string;
  provider: string;
  reachable: boolean;
}

export function AiConfigurationManager({
  status,
  canManage,
}: {
  readonly status: AiStatusResponse;
  readonly canManage: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<'danger' | 'success'>('success');
  const [pricing, setPricing] = useState<readonly PricingRow[]>([]);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTest | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/ai/pricing', { headers: { accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok || cancelled) return;
        const payload = (await response.json()) as { items: PricingRow[] };
        if (!cancelled) setPricing(payload.items ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setLoading(true);
    setMessage(null);
    mutation('/api/ai/config', 'PATCH', {
      dailyCostLimitMicros: numberOrNull(data.get('dailyCostLimitMicros')),
      dailyTokenLimit: numberOrNull(data.get('dailyTokenLimit')),
      enabled: data.get('enabled') === 'on',
      maxOutputTokens: Number(data.get('maxOutputTokens')),
      maxTokensPerRequest: numberOrNull(data.get('maxTokensPerRequest')),
      model: String(data.get('model')),
      monthlyCostLimitMicros: numberOrNull(data.get('monthlyCostLimitMicros')),
      provider: String(data.get('provider')),
      retrievalMode: String(data.get('retrievalMode')),
      streamingEnabled: data.get('streamingEnabled') === 'on',
      timeoutMs: Number(data.get('timeoutMs')),
      topK: Number(data.get('topK')),
    })
      .then(() => {
        setTone('success');
        setMessage('Configuração da IA salva com sucesso.');
        router.refresh();
      })
      .catch((problem: unknown) => {
        setTone('danger');
        setMessage(
          problem instanceof Error ? problem.message : 'Falha inesperada',
        );
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const savePricing = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setLoading(true);
    setMessage(null);
    mutation('/api/ai/pricing', 'PUT', {
      currency: String(data.get('currency') || 'USD'),
      inputPerMillionMicros: Number(data.get('inputPerMillionMicros')),
      model: String(data.get('model')),
      outputPerMillionMicros: Number(data.get('outputPerMillionMicros')),
      provider: String(data.get('provider')),
    })
      .then(async () => {
        setTone('success');
        setMessage('Preço salvo com sucesso.');
        const response = await fetch('/api/ai/pricing', {
          headers: { accept: 'application/json' },
        });
        if (response.ok) {
          const payload = (await response.json()) as { items: PricingRow[] };
          setPricing(payload.items ?? []);
        }
        router.refresh();
      })
      .catch((problem: unknown) => {
        setTone('danger');
        setMessage(
          problem instanceof Error ? problem.message : 'Falha inesperada',
        );
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const testConnection = () => {
    setTesting(true);
    setTestResult(null);
    mutation('/api/ai/test-connection', 'POST', {})
      .then((payload) => {
        setTestResult(payload as ConnectionTest);
      })
      .catch(() => {
        setTestResult(null);
        setTone('danger');
        setMessage('Falha ao testar a conexão com o provedor.');
      })
      .finally(() => {
        setTesting(false);
      });
  };

  return (
    <div className="space-y-7">
      {message ? <Alert tone={tone}>{message}</Alert> : null}
      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">Larcarvalho AI — estado atual</h3>
          <Badge tone={status.ready ? 'success' : 'neutral'}>
            {status.ready ? 'Pronta' : 'Não configurada'}
          </Badge>
        </div>
        <p className="text-sm text-[var(--color-muted)]">{status.message}</p>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[var(--color-muted)]">Provedor</dt>
            <dd className="font-medium">{status.config.provider}</dd>
          </div>
          <div>
            <dt className="text-[var(--color-muted)]">Modelo</dt>
            <dd className="font-medium">{status.config.model}</dd>
          </div>
          <div>
            <dt className="text-[var(--color-muted)]">Ativada</dt>
            <dd className="font-medium">
              {status.config.enabled ? 'Sim' : 'Não'}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--color-muted)]">Provedor configurado</dt>
            <dd className="font-medium">
              {status.config.providerConfigured ? 'Sim' : 'Não'}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--color-muted)]">Streaming</dt>
            <dd className="font-medium">
              {status.config.streamingEnabled === false ? 'Não' : 'Sim'}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--color-muted)]">Recuperação</dt>
            <dd className="font-medium">
              {status.config.retrievalMode ?? 'lexical'}
              {status.config.vectorSearchAvailable ? '' : ' (somente lexical)'}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--color-muted)]">TopK</dt>
            <dd className="font-medium">{status.config.topK ?? 5}</dd>
          </div>
        </dl>
        <p className="text-xs text-[var(--color-muted)]">
          Nenhuma chave de API é exibida ou armazenada nesta tela. O provedor
          externo lê a credencial do ambiente do servidor.
        </p>
        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button loading={testing} onClick={testConnection} type="button" variant="outline">
              Testar conexão
            </Button>
            {testResult ? (
              <p className="text-sm text-[var(--color-muted)]">
                {testResult.provider}/{testResult.model}:{' '}
                {testResult.reachable ? 'alcançável' : 'inalcançável'}
                {testResult.latencyMs !== null ? ` em ${testResult.latencyMs}ms` : ''}
                {testResult.configured ? '' : ' (não configurado)'}
              </p>
            ) : null}
          </div>
        ) : null}
      </Card>
      <AiUsageDashboard />
      {canManage ? (
        <>
          <Card className="p-5">
            <h3 className="font-semibold">Geral, streaming, RAG e limites</h3>
            <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={save}>
              <Field label="Ativada">
                <Select
                  defaultValue={status.config.enabled ? 'on' : 'off'}
                  name="enabled"
                >
                  <option value="on">Sim</option>
                  <option value="off">Não</option>
                </Select>
              </Field>
              <Field label="Provedor">
                <Select defaultValue={status.config.provider} name="provider">
                  <option value="mock">mock (simulado)</option>
                  <option value="external">external (HTTP compatível)</option>
                </Select>
              </Field>
              <Field label="Modelo">
                <Input
                  defaultValue={status.config.model}
                  name="model"
                  required
                />
              </Field>
              <Field label="Limite de saída (tokens)">
                <Input
                  defaultValue={String(status.config.maxOutputTokens)}
                  min={128}
                  max={8000}
                  name="maxOutputTokens"
                  required
                  type="number"
                />
              </Field>
              <Field label="Timeout (ms)">
                <Input
                  defaultValue={String(status.config.timeoutMs)}
                  min={1000}
                  max={60000}
                  name="timeoutMs"
                  required
                  type="number"
                />
              </Field>
              <Field label="Streaming">
                <Select
                  defaultValue={
                    status.config.streamingEnabled === false ? 'off' : 'on'
                  }
                  name="streamingEnabled"
                >
                  <option value="on">Sim</option>
                  <option value="off">Não</option>
                </Select>
              </Field>
              <Field label="Recuperação">
                <Select
                  defaultValue={status.config.retrievalMode ?? 'lexical'}
                  name="retrievalMode"
                >
                  <option value="lexical">lexical</option>
                  <option value="hybrid">hybrid (exige índice vetorial)</option>
                </Select>
              </Field>
              <Field label="TopK">
                <Input
                  defaultValue={String(status.config.topK ?? 5)}
                  min={1}
                  max={20}
                  name="topK"
                  required
                  type="number"
                />
              </Field>
              <Field label="Limite diário de tokens (vazio = sem limite)">
                <Input
                  defaultValue={
                    status.config.dailyTokenLimit === null ||
                    status.config.dailyTokenLimit === undefined
                      ? ''
                      : String(status.config.dailyTokenLimit)
                  }
                  min={0}
                  name="dailyTokenLimit"
                  type="number"
                />
              </Field>
              <Field label="Custo diário máx. (micros, vazio = sem limite)">
                <Input
                  defaultValue={
                    status.config.dailyCostLimitMicros === null ||
                    status.config.dailyCostLimitMicros === undefined
                      ? ''
                      : String(status.config.dailyCostLimitMicros)
                  }
                  min={0}
                  name="dailyCostLimitMicros"
                  type="number"
                />
              </Field>
              <Field label="Custo mensal máx. (micros, vazio = sem limite)">
                <Input
                  defaultValue={
                    status.config.monthlyCostLimitMicros === null ||
                    status.config.monthlyCostLimitMicros === undefined
                      ? ''
                      : String(status.config.monthlyCostLimitMicros)
                  }
                  min={0}
                  name="monthlyCostLimitMicros"
                  type="number"
                />
              </Field>
              <Field label="Máx. tokens por requisição (vazio = sem limite)">
                <Input
                  defaultValue={
                    status.config.maxTokensPerRequest === null ||
                    status.config.maxTokensPerRequest === undefined
                      ? ''
                      : String(status.config.maxTokensPerRequest)
                  }
                  min={1000}
                  name="maxTokensPerRequest"
                  type="number"
                />
              </Field>
              <div className="sm:col-span-2">
                <Button loading={loading} type="submit">
                  Salvar configuração
                </Button>
              </div>
            </form>
          </Card>
          <Card className="space-y-3 p-5">
            <h3 className="font-semibold">Precificação (micros por milhão de tokens)</h3>
            <p className="text-xs text-[var(--color-muted)]">
              Sem preço configurado, o custo é exibido como “Custo não
              configurado” — nunca R$ 0,00.
            </p>
            {pricing.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs tracking-wide text-[var(--color-muted)] uppercase">
                      <th className="py-2 pr-3">Provedor/modelo</th>
                      <th className="py-2 pr-3">Entrada/M</th>
                      <th className="py-2 pr-3">Saída/M</th>
                      <th className="py-2 pr-3">Moeda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pricing.map((row) => (
                      <tr key={row.id} className="border-t border-[var(--color-border)]">
                        <td className="py-2 pr-3">
                          {row.provider}/{row.model}
                        </td>
                        <td className="py-2 pr-3">{row.inputPerMillionMicros}</td>
                        <td className="py-2 pr-3">{row.outputPerMillionMicros}</td>
                        <td className="py-2 pr-3">{row.currency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={savePricing}>
              <Field label="Provedor">
                <Select defaultValue="mock" name="provider">
                  <option value="mock">mock</option>
                  <option value="external">external</option>
                </Select>
              </Field>
              <Field label="Modelo">
                <Input name="model" required />
              </Field>
              <Field label="Moeda">
                <Input defaultValue="USD" name="currency" required />
              </Field>
              <Field label="Entrada por milhão (micros)">
                <Input min={0} name="inputPerMillionMicros" required type="number" />
              </Field>
              <Field label="Saída por milhão (micros)">
                <Input min={0} name="outputPerMillionMicros" required type="number" />
              </Field>
              <div className="sm:col-span-2">
                <Button loading={loading} type="submit" variant="outline">
                  Salvar preço
                </Button>
              </div>
            </form>
          </Card>
        </>
      ) : null}
    </div>
  );
}
