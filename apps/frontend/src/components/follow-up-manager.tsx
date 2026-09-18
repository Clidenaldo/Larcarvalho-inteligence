'use client';

import type { FollowUp } from '@larcarvalho/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Field, Input, Select } from './ui/field';

async function mutation(path: string, method: string, body?: unknown) {
  const response = await fetch(path, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { 'content-type': 'application/json' },
    method,
  });
  if (!response.ok) {
    const payload = (await response.json()) as { error?: { message?: string } };
    throw new Error(payload.error?.message ?? 'Operação não concluída');
  }
}

const typeLabels: Record<FollowUp['type'], string> = {
  CALL: 'Ligação',
  EMAIL: 'E-mail',
  MEETING: 'Reunião',
  OTHER: 'Outro',
  WHATSAPP: 'WhatsApp',
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR');
}

function toInputValue(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function FollowUpManager({
  canCreate,
  canUpdate,
  items,
  leadId,
}: {
  readonly canCreate: boolean;
  readonly canUpdate: boolean;
  readonly items: FollowUp[];
  readonly leadId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; tone: 'danger' | 'success' } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const run = async (key: string, operation: () => Promise<void>, success: string) => {
    setPending(key);
    setFeedback(null);
    try {
      await operation();
      setFeedback({ message: success, tone: 'success' });
      setEditingId(null);
      router.refresh();
    } catch (error) {
      setFeedback({
        message: error instanceof Error ? error.message : 'Falha inesperada',
        tone: 'danger',
      });
    } finally {
      setPending(null);
    }
  };

  const create = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const dueAt = String(data.get('dueAt'));
    void run(
      'create',
      () =>
        mutation('/api/followups', 'POST', {
          dueAt: new Date(dueAt).toISOString(),
          leadId,
          notes: data.get('notes') || undefined,
          title: data.get('title'),
          type: data.get('type'),
        }).then(() => undefined),
      'Follow-up agendado.',
    );
  };

  return (
    <div className="space-y-4">
      {feedback ? <Alert tone={feedback.tone}>{feedback.message}</Alert> : null}
      {items.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">Nenhum follow-up pendente.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <Card className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{item.title}</span>
                  <Badge tone={item.isOverdue ? 'danger' : 'neutral'}>
                    {item.isOverdue ? 'Em atraso' : typeLabels[item.type]}
                  </Badge>
                  <span className="text-xs text-[var(--color-muted)]">
                    vence {formatDateTime(item.dueAt)}
                  </span>
                </div>
                {item.notes ? (
                  <p className="text-sm text-[var(--color-muted)]">{item.notes}</p>
                ) : null}
                {editingId === item.id && canUpdate ? (
                  <form
                    className="grid gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      void run(
                        `edit-${item.id}`,
                        () =>
                          mutation(`/api/followups/${item.id}`, 'PATCH', {
                            dueAt: new Date(String(data.get('dueAt'))).toISOString(),
                            notes: data.get('notes') || null,
                            title: data.get('title'),
                          }).then(() => undefined),
                        'Follow-up atualizado.',
                      );
                    }}
                  >
                    <Field label="Título">
                      <Input defaultValue={item.title} name="title" required />
                    </Field>
                    <Field label="Vencimento">
                      <Input
                        defaultValue={toInputValue(item.dueAt)}
                        name="dueAt"
                        required
                        type="datetime-local"
                      />
                    </Field>
                    <Field label="Observações">
                      <Input defaultValue={item.notes ?? ''} name="notes" />
                    </Field>
                    <div className="flex gap-2">
                      <Button disabled={pending !== null} type="submit">
                        Salvar
                      </Button>
                      <Button
                        onClick={() => setEditingId(null)}
                        type="button"
                        variant="outline"
                      >
                        Cancelar edição
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {canUpdate ? (
                      <Button
                        onClick={() => setEditingId(item.id)}
                        type="button"
                        variant="outline"
                      >
                        Editar
                      </Button>
                    ) : null}
                    {canCreate ? (
                      <Button
                        disabled={pending !== null}
                        onClick={() =>
                          void run(
                            `done-${item.id}`,
                            () =>
                              mutation(`/api/followups/${item.id}/status`, 'POST', {
                                status: 'COMPLETED',
                              }).then(() => undefined),
                            'Follow-up concluído.',
                          )
                        }
                        type="button"
                      >
                        Concluir
                      </Button>
                    ) : null}
                    {canUpdate ? (
                      <Button
                        disabled={pending !== null}
                        onClick={() =>
                          void run(
                            `cancel-${item.id}`,
                            () =>
                              mutation(`/api/followups/${item.id}/status`, 'POST', {
                                status: 'CANCELED',
                              }).then(() => undefined),
                            'Follow-up cancelado.',
                          )
                        }
                        type="button"
                        variant="outline"
                      >
                        Cancelar
                      </Button>
                    ) : null}
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
      {canCreate ? (
        <Card className="p-4">
          <h4 className="font-medium">Agendar follow-up</h4>
          <form className="mt-2 grid gap-2 sm:grid-cols-2" onSubmit={create}>
            <Field label="Título">
              <Input name="title" required maxLength={200} />
            </Field>
            <Field label="Tipo">
              <Select name="type" defaultValue="CALL">
                <option value="CALL">Ligação</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="EMAIL">E-mail</option>
                <option value="MEETING">Reunião</option>
                <option value="OTHER">Outro</option>
              </Select>
            </Field>
            <Field label="Vencimento">
              <Input name="dueAt" required type="datetime-local" />
            </Field>
            <Field label="Observações">
              <Input name="notes" maxLength={2000} />
            </Field>
            <div className="sm:col-span-2">
              <Button disabled={pending !== null} type="submit">
                Agendar
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
