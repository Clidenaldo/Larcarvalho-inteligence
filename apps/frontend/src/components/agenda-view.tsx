'use client';

import type { AgendaItem, AgendaResponse } from '@larcarvalho/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { AiOpenDetail } from './ai-copilot';
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

function openAiCopilot(detail: AiOpenDetail) {
  window.dispatchEvent(new CustomEvent<AiOpenDetail>('larcarvalho:ai-open', { detail }));
}

/**
 * Regra documentada de reagendamento rápido: "hoje mais tarde" = agora + 4h;
 * após às 18h (Fortaleza), cai para amanhã às 09h. Nunca sobrescreve sem
 * confirmação: cada opção exige um clique explícito.
 */
function quickDueAt(option: 'later' | 'tomorrow' | 'plus2' | 'plus7'): string {
  const now = new Date();
  const atFortalezaHour = Number(
    new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hour12: false, timeZone: 'America/Fortaleza' }).format(now),
  );
  const target = new Date(now);
  if (option === 'later') {
    if (atFortalezaHour >= 18) {
      target.setDate(target.getDate() + 1);
      target.setHours(9, 0, 0, 0);
    } else {
      target.setHours(target.getHours() + 4);
    }
  } else if (option === 'tomorrow') {
    target.setDate(target.getDate() + 1);
    target.setHours(9, 0, 0, 0);
  } else if (option === 'plus2') {
    target.setDate(target.getDate() + 2);
    target.setHours(9, 0, 0, 0);
  } else {
    target.setDate(target.getDate() + 7);
    target.setHours(9, 0, 0, 0);
  }
  return target.toISOString();
}

function formatDateTime(value: string | null) {
  if (!value) return 'Sem data';
  return new Date(value).toLocaleString('pt-BR');
}

function NextActionForm({ leadId, leadNome, onDone }: { readonly leadId: string; readonly leadNome: string; readonly onDone: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="grid gap-2 rounded-lg border border-dashed border-[var(--color-border-strong)] p-3"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setPending(true);
        setError(null);
        mutation('/api/followups', 'POST', {
          dueAt: new Date(String(data.get('dueAt'))).toISOString(),
          leadId,
          notes: data.get('notes') || undefined,
          title: data.get('title'),
          type: data.get('type'),
        })
          .then(() => onDone())
          .catch((problem: unknown) => {
            setError(problem instanceof Error ? problem.message : 'Falha inesperada');
          })
          .finally(() => setPending(false));
      }}
    >
      <p className="text-sm font-medium">Agendar próxima ação para {leadNome}</p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
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
      <Button disabled={pending} type="submit">
        Criar follow-up
      </Button>
    </form>
  );
}

function RescheduleControls({ followUpId, onDone }: { readonly followUpId: string; readonly onDone: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const apply = (dueAt: string) => {
    setPending(true);
    setError(null);
    mutation(`/api/followups/${followUpId}`, 'PATCH', { dueAt })
      .then(() => onDone())
      .catch((problem: unknown) => {
        setError(problem instanceof Error ? problem.message : 'Falha inesperada');
      })
      .finally(() => setPending(false));
  };
  const options = [
    { key: 'later', label: 'Hoje mais tarde' },
    { key: 'tomorrow', label: 'Amanhã' },
    { key: 'plus2', label: '+2 dias' },
    { key: 'plus7', label: '+7 dias' },
  ] as const;
  return (
    <div className="space-y-2">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            disabled={pending}
            key={option.key}
            onClick={() => apply(quickDueAt(option.key))}
            type="button"
            variant="outline"
          >
            {option.label}
          </Button>
        ))}
        <Button
          disabled={pending}
          onClick={() => setCustomOpen((current) => !current)}
          type="button"
          variant="outline"
        >
          Escolher data
        </Button>
      </div>
      {customOpen ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            apply(new Date(String(data.get('dueAt'))).toISOString());
          }}
        >
          <Field label="Nova data e hora">
            <Input name="dueAt" required type="datetime-local" />
          </Field>
          <Button disabled={pending} type="submit">
            Reagendar
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function AgendaCard({
  canComplete,
  canReschedule,
  item,
  onDone,
}: {
  readonly canComplete: boolean;
  readonly canReschedule: boolean;
  readonly item: AgendaItem;
  readonly onDone: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [nextAction, setNextAction] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const complete = () => {
    if (!item.followUpId) return;
    const followUpId: string = item.followUpId;
    setPending(true);
    setError(null);
    mutation(`/api/followups/${followUpId}/status`, 'POST', { status: 'COMPLETED' })
      .then(() => {
        setFeedback('Follow-up concluído. Agende a próxima ação abaixo.');
        setNextAction(true);
      })
      .catch((problem: unknown) => {
        setError(problem instanceof Error ? problem.message : 'Falha inesperada');
      })
      .finally(() => setPending(false));
  };

  const typeLabels: Record<string, string> = {
    CALL: 'Ligação',
    EMAIL: 'E-mail',
    MEETING: 'Reunião',
    OTHER: 'Outro',
    WHATSAPP: 'WhatsApp',
  };
  return (
    <Card className="space-y-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link className="font-semibold underline" href={`/dashboard/clientes/${item.leadId}`}>
          {item.leadNome}
        </Link>
        {item.responsavel ? (
          <span className="text-xs text-[var(--color-muted)]">· {item.responsavel.nome}</span>
        ) : null}
        <span className="text-xs text-[var(--color-muted)]">
          {item.dueAt ? formatDateTime(item.dueAt) : item.leadStatus.replaceAll('_', ' ')}
        </span>
        {item.followUpType ? (
          <span className="text-xs text-[var(--color-muted)]">· {typeLabels[item.followUpType] ?? item.followUpType}</span>
        ) : null}
      </div>
      {item.followUpTitle ? (
        <p className="text-sm font-medium">{item.followUpTitle}</p>
      ) : null}
      <p className="text-sm">
        <strong>Por que está aqui? </strong>
        {item.reason}
      </p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {feedback ? <Alert tone="success">{feedback}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        {item.followUpId && canComplete ? (
          <Button disabled={pending} onClick={complete} type="button">
            Concluir follow-up
          </Button>
        ) : null}
        {item.followUpId && canReschedule ? (
          <Button
            disabled={pending}
            onClick={() => setRescheduling((current) => !current)}
            type="button"
            variant="outline"
          >
            Reagendar
          </Button>
        ) : null}
        <Button
          onClick={() =>
            openAiCopilot({
              contextId: item.leadId,
              contextType: 'LEAD',
              message: `Prepare uma mensagem de follow-up para ${item.leadNome}`,
              promptId: 'follow-up-draft',
            })
          }
          type="button"
          variant="outline"
        >
          Preparar mensagem
        </Button>
      </div>
      {rescheduling && item.followUpId ? (
        <RescheduleControls
          followUpId={item.followUpId}
          onDone={() => {
            setRescheduling(false);
            onDone();
            router.refresh();
          }}
        />
      ) : null}
      {nextAction ? (
        <NextActionForm
          leadId={item.leadId}
          leadNome={item.leadNome}
          onDone={() => {
            setNextAction(false);
            onDone();
            router.refresh();
          }}
        />
      ) : null}
    </Card>
  );
}

function Block({
  canComplete,
  canReschedule,
  empty,
  items,
  onDone,
  title,
}: {
  readonly canComplete: boolean;
  readonly canReschedule: boolean;
  readonly empty: string;
  readonly items: AgendaItem[];
  readonly onDone: () => void;
  readonly title: string;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold">
        {title} <Badge tone="neutral">{items.length}</Badge>
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={`${item.kind}-${item.followUpId ?? item.leadId}`}>
              <AgendaCard
                canComplete={canComplete}
                canReschedule={canReschedule}
                item={item}
                onDone={onDone}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AgendaView({
  canComplete,
  canReschedule,
  initial,
  showTeam,
}: {
  readonly canComplete: boolean;
  readonly canReschedule: boolean;
  readonly initial: AgendaResponse;
  readonly showTeam: boolean;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<string | null>(null);
  const refresh = () => {
    setFeedback('Agenda atualizada.');
    router.refresh();
  };
  return (
    <div className="space-y-8">
      {feedback ? <Alert tone="success">{feedback}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-[var(--color-muted)]">Atrasados</p>
          <p className="text-2xl font-semibold">{initial.totals.overdue}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[var(--color-muted)]">Hoje</p>
          <p className="text-2xl font-semibold">{initial.totals.today}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[var(--color-muted)]">Propostas aguardando</p>
          <p className="text-2xl font-semibold">{initial.totals.proposalsAwaiting}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[var(--color-muted)]">Vendas aguardando docs</p>
          <p className="text-2xl font-semibold">{initial.totals.salesAwaiting}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[var(--color-muted)]">Concluídos hoje</p>
          <p className="text-2xl font-semibold">{initial.completedToday}</p>
        </Card>
      </div>
      <Block
        canComplete={canComplete}
        canReschedule={canReschedule}
        empty="Nenhum follow-up atrasado. Bom trabalho."
        items={initial.overdue}
        onDone={refresh}
        title="Atrasados"
      />
      <Block
        canComplete={canComplete}
        canReschedule={canReschedule}
        empty="Nada vencendo hoje."
        items={initial.today}
        onDone={refresh}
        title="Hoje"
      />
      <Block
        canComplete={canComplete}
        canReschedule={canReschedule}
        empty="Nenhum próximo follow-up no período."
        items={initial.upcoming}
        onDone={refresh}
        title="Próximos"
      />
      <Block
        canComplete={canComplete}
        canReschedule={canReschedule}
        empty="Nenhuma proposta aguardando retorno."
        items={initial.proposalsAwaiting}
        onDone={refresh}
        title="Propostas aguardando retorno"
      />
      <Block
        canComplete={canComplete}
        canReschedule={canReschedule}
        empty="Nenhuma venda aguardando documentos."
        items={initial.salesAwaiting}
        onDone={refresh}
        title="Vendas aguardando documentos"
      />
      <Block
        canComplete={canComplete}
        canReschedule={canReschedule}
        empty="Todos os clientes ativos têm próxima ação."
        items={initial.noNextAction}
        onDone={refresh}
        title="Sem próxima ação"
      />
      <Block
        canComplete={canComplete}
        canReschedule={canReschedule}
        empty="Nenhum cliente sem contato recente."
        items={initial.staleContacts}
        onDone={refresh}
        title="Sem contato recente"
      />
      {showTeam ? (
        <section className="space-y-3">
          <h3 className="text-lg font-semibold">Distribuição da equipe</h3>
          {initial.distribution.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">Sem pendências na equipe.</p>
          ) : (
            <ul className="space-y-2">
              {initial.distribution.map((entry) => (
                <li key={entry.userId}>
                  <Card className="flex flex-wrap items-center gap-2 p-4 text-sm">
                    <span className="font-medium">{entry.nome}</span>
                    <span className="text-[var(--color-muted)]">
                      {entry.overdue} em atraso · {entry.today} para hoje
                    </span>
                  </Card>
                </li>
              ))}
            </ul>
          )}
          {initial.withoutFutureAgenda.length > 0 ? (
            <div>
              <h4 className="text-sm font-semibold">Sem agenda futura</h4>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {initial.withoutFutureAgenda.map((member) => (
                  <li key={member.userId}>{member.nome}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
