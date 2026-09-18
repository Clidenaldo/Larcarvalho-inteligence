'use client';
import type { AuthResponse, DataQualityIssue } from '@larcarvalho/shared';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { Field, Input } from './ui/field';
async function errorMessage(response: Response) {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? 'Operação não concluída';
  } catch {
    return 'Operação não concluída';
  }
}
export function DataQualityActions({
  identity,
  issue,
}: {
  identity: AuthResponse;
  issue: DataQualityIssue;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [action, setAction] = useState('Dado corrigido no cadastro de origem');
  const review = identity.permissions.includes('data_quality.review');
  const resolve = identity.permissions.includes('data_quality.resolve');
  async function run(path: string, method: 'POST' | 'PATCH', body: object) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/data-quality/issues/${issue.id}/${path}`,
        {
          method,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) throw new Error(await errorMessage(response));
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          helpKey="quality.note"
          label={
            issue.status === 'OPEN' || issue.status === 'IN_REVIEW'
              ? 'Observação'
              : 'Motivo da reabertura'
          }
        >
          <Input
            maxLength={2000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
        {(issue.status === 'OPEN' || issue.status === 'IN_REVIEW') &&
        resolve ? (
          <Field helpKey="quality.action" label="Ação realizada">
            <Input
              maxLength={300}
              value={action}
              onChange={(event) => setAction(event.target.value)}
            />
          </Field>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {issue.status === 'OPEN' && review ? (
          <Button
            loading={busy}
            variant="outline"
            onClick={() =>
              void run('status', 'PATCH', {
                status: 'IN_REVIEW',
                observacao: note || undefined,
              })
            }
          >
            Marcar em análise
          </Button>
        ) : null}
        {['OPEN', 'IN_REVIEW'].includes(issue.status) && resolve ? (
          <>
            <Button
              loading={busy}
              onClick={() =>
                void run('resolve', 'POST', {
                  acaoRealizada: action,
                  observacao: note || undefined,
                })
              }
            >
              Resolver
            </Button>
            <Button
              loading={busy}
              variant="outline"
              disabled={!note.trim()}
              onClick={() =>
                void run('ignore', 'POST', { justificativa: note })
              }
            >
              Ignorar com justificativa
            </Button>
          </>
        ) : null}
        {['RESOLVED', 'IGNORED'].includes(issue.status) && resolve ? (
          <Button
            loading={busy}
            onClick={() =>
              void run('reopen', 'POST', { observacao: note || undefined })
            }
          >
            Reabrir
          </Button>
        ) : null}
      </div>
    </div>
  );
}
