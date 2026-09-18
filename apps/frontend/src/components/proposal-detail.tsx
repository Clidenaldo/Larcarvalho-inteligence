'use client';

import type { Proposal, ProposalVersionChain } from '@larcarvalho/shared';
import { Download, MessageCircle, Printer, Send } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { formatBrl } from '../lib/formatters';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Field, Input, Select } from './ui/field';

const money = (value: string | null) =>
  value === null ? 'Não disponível' : formatBrl(Number(value));
const statusLabels = {
  DRAFT: 'Rascunho',
  GENERATED: 'Gerada',
  SENT: 'Enviada',
  VIEWED: 'Visualizada',
  ACCEPTED: 'Aceita',
  REJECTED: 'Recusada',
  EXPIRED: 'Expirada',
  CANCELLED: 'Cancelada',
} as const;

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
  return response;
}

function FollowUpSuggest({ leadId, leadNome }: { readonly leadId: string; readonly leadNome: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'danger' | 'success' } | null>(null);
  const schedule = (days: number) => {
    const dueAt = new Date(Date.now() + days * 86_400_000);
    dueAt.setHours(9, 0, 0, 0);
    setPending(true);
    setMessage(null);
    mutation('/api/followups', 'POST', {
      dueAt: dueAt.toISOString(),
      leadId,
      title: `Retorno da proposta — ${leadNome}`,
      type: 'CALL',
    })
      .then(() => {
        setMessage({ text: 'Retorno agendado. Acompanhe pela Agenda.', tone: 'success' });
        router.refresh();
      })
      .catch((problem: unknown) => {
        setMessage({
          text: problem instanceof Error ? problem.message : 'Falha inesperada',
          tone: 'danger',
        });
      })
      .finally(() => setPending(false));
  };
  return (
    <Card className="space-y-3 p-6 print:hidden">
      <h3 className="text-lg font-semibold">Agendar retorno?</h3>
      <p className="text-sm text-[var(--color-muted)]">
        Proposta apresentada sem follow-up futuro. Nada é criado sem a sua confirmação.
      </p>
      {message ? (
        <p
          className="rounded-xl bg-slate-50 p-3 text-sm"
          role={message.tone === 'danger' ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {[
          { days: 1, label: 'Amanhã' },
          { days: 2, label: '+2 dias' },
          { days: 3, label: '+3 dias' },
          { days: 7, label: '+7 dias' },
        ].map((option) => (
          <Button
            disabled={pending}
            key={option.label}
            onClick={() => schedule(option.days)}
            type="button"
            variant="outline"
          >
            {option.label}
          </Button>
        ))}
      </div>
    </Card>
  );
}

export function ProposalDetail({
  proposal,
  versions,
  canEdit,
  canCreateVersion,
  canCreateSale,
  suggestFollowUp,
}: {
  readonly proposal: Proposal;
  readonly versions: ProposalVersionChain | null;
  readonly canEdit: boolean;
  readonly canCreateVersion: boolean;
  readonly canCreateSale: boolean;
  readonly suggestFollowUp: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [whatsapp, setWhatsapp] = useState('');
  const [editing, setEditing] = useState(false);
  const [versionTitle, setVersionTitle] = useState('');
  const saveEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      await mutation(`/api/proposals/${proposal.id}`, 'PATCH', {
        ...(data.get('title') ? { title: data.get('title') } : {}),
        ...(data.get('objectiveSummary') ? { objectiveSummary: data.get('objectiveSummary') } : {}),
        notes: data.get('notes') || null,
      });
      setEditing(false);
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Falha inesperada');
    } finally {
      setLoading(false);
    }
  };
  const createSale = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          proposalId: proposal.id,
          proposalItemId: data.get('proposalItemId'),
          origemVenda: data.get('origemVenda') || 'CRM',
        }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? 'Venda não criada');
      }
      const created = (await response.json()) as { id: string };
      window.location.assign(`/dashboard/vendas/${created.id}`);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Falha inesperada');
    } finally {
      setLoading(false);
    }
  };
  const createVersion = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await mutation(`/api/proposals/${proposal.id}/versions`, 'POST', {
        ...(versionTitle.trim() ? { title: versionTitle.trim() } : {}),
      });
      const created = (await response.json()) as { id: string };
      // Navegação plena: o router.push do App Router não commitava nesta
      // tela (POST 201 confirmado, URL inalterada); a página destino é
      // server-rendered e deve carregar estado fresco da nova versão.
      window.location.assign(`/propostas/${created.id}`);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Falha inesperada');
    } finally {
      setLoading(false);
    }
  };
  const status = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/proposals/${proposal.id}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: data.get('status'),
          ...(data.get('reason') ? { reason: data.get('reason') } : {}),
        }),
      });
      if (!response.ok) {
        const body = (await response.json()) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message ?? 'Status não alterado');
      }
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Falha inesperada');
    } finally {
      setLoading(false);
    }
  };
  const pdf = async (detail: 'full' | 'summary' = 'full') => {
    setLoading(true);
    setError(null);
    try {
      const query = detail === 'summary' ? '?detail=summary' : '';
      const response = await fetch(
        `/api/proposals/${proposal.id}/pdf${query}`,
        { method: 'POST' },
      );
      if (!response.ok) throw new Error('Não foi possível gerar o PDF');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${proposal.number}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Falha inesperada');
    } finally {
      setLoading(false);
    }
  };
  const print = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/proposals/${proposal.id}/print`, {
        method: 'POST',
      });
      if (!response.ok)
        throw new Error('Não foi possível registrar a impressão');
      window.print();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Falha inesperada');
    } finally {
      setLoading(false);
    }
  };
  const shareWhatsApp = async () => {
    setError(null);
    const scenarios = proposal.items
      .map((item) => {
        const result = item.financialSnapshot;
        return [
          `Cenário ${item.position}: ${item.description}`,
          `Crédito: ${money(result.contractedCredit)}`,
          `Parcela inicial: ${money(result.initialInstallment)}`,
          `Prazo restante: ${result.remainingTermMonths} meses`,
        ].join('\n');
      })
      .join('\n\n');
    const message = [
      `Olá! Segue a proposta ${proposal.number} da Larcarvalho Consórcios.`,
      proposal.title,
      '',
      scenarios,
      '',
      `Válida até ${new Date(proposal.validUntil).toLocaleDateString('pt-BR')}.`,
      'Condições sujeitas à confirmação da administradora.',
    ].join('\n');
    const recipient = whatsapp.replace(/\D/g, '');
    const target = recipient ? `https://wa.me/${recipient}` : 'https://wa.me/';
    const shareWindow = window.open(
      `${target}?text=${encodeURIComponent(message)}`,
      '_blank',
      'noopener,noreferrer',
    );
    if (!shareWindow) {
      setError('Permita pop-ups para abrir o WhatsApp.');
      return;
    }
    if (proposal.status === 'SENT') return;
    setLoading(true);
    try {
      const response = await fetch(`/api/proposals/${proposal.id}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'SENT',
          reason: 'Compartilhada pelo WhatsApp',
        }),
      });
      if (!response.ok) {
        const body = (await response.json()) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message ?? 'Envio não registrado');
      }
      router.refresh();
    } catch (problem) {
      setError(
        problem instanceof Error
          ? `WhatsApp aberto, mas ${problem.message.toLowerCase()}.`
          : 'WhatsApp aberto, mas o envio não foi registrado.',
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="space-y-7">
      <div className="flex flex-wrap gap-3 print:hidden">
        <Button loading={loading} onClick={() => void pdf()}>
          <Download className="h-4 w-4" /> Exportar PDF
        </Button>
        <Button
          loading={loading}
          onClick={() => void pdf('summary')}
          variant="outline"
        >
          <Download className="h-4 w-4" /> Exportar PDF resumido
        </Button>
        <Button
          loading={loading}
          onClick={() => void print()}
          variant="outline"
        >
          <Printer className="h-4 w-4" /> Imprimir
        </Button>
        <div className="flex items-end gap-2">
          <Field helpKey="proposal.whatsapp" label="WhatsApp do cliente">
            <Input
              inputMode="tel"
              onChange={(event) => setWhatsapp(event.target.value)}
              placeholder="5511999999999"
              value={whatsapp}
            />
          </Field>
          <Button
            loading={loading}
            onClick={() => void shareWhatsApp()}
            variant="outline"
          >
            <MessageCircle className="h-4 w-4" /> Enviar por WhatsApp
          </Button>
        </div>
      </div>
      {error ? (
        <p
          className="rounded-xl bg-red-50 p-4 text-sm text-[var(--color-danger)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <Card className="overflow-hidden">
        <div className="bg-[var(--color-primary)] p-6 text-white">
          <p className="text-sm font-semibold opacity-80">
            Larcarvalho Consórcios
          </p>
          <h3 className="mt-2 text-2xl font-bold">{proposal.title}</h3>
          <p className="mt-2 text-sm opacity-80">
            {proposal.number} · versão {proposal.version}
          </p>
        </div>
        <div className="grid gap-5 p-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-sm text-[var(--color-muted)]">Cliente</p>
            <p className="font-semibold">{proposal.clientName}</p>
          </div>
          <div>
            <p className="text-sm text-[var(--color-muted)]">Vendedor</p>
            <p className="font-semibold">{proposal.sellerName}</p>
          </div>
          <div>
            <p className="text-sm text-[var(--color-muted)]">Validade</p>
            <p className="font-semibold">
              {new Date(proposal.validUntil).toLocaleDateString('pt-BR')}
            </p>
          </div>
          <div>
            <p className="text-sm text-[var(--color-muted)]">Status</p>
            <Badge
              tone={
                proposal.status === 'ACCEPTED'
                  ? 'success'
                  : proposal.status === 'REJECTED' ||
                      proposal.status === 'CANCELLED'
                    ? 'danger'
                    : 'info'
              }
            >
              {statusLabels[proposal.status]}
            </Badge>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <p className="text-sm text-[var(--color-muted)]">Objetivo</p>
            <p>{proposal.objectiveSummary}</p>
          </div>
        </div>
      </Card>
      {versions && versions.items.length > 1 ? (
        <Card className="space-y-2 p-6 print:hidden">
          <h3 className="text-lg font-semibold">
            Versão {proposal.version} de {versions.items.length}
          </h3>
          <ol className="flex flex-wrap gap-2">
            {versions.items.map((item) => (
              <li key={item.id}>
                {item.id === proposal.id ? (
                  <Badge tone="info">
                    v{item.version} · {item.number} (atual)
                  </Badge>
                ) : (
                  <Link
                    className="text-sm underline"
                    href={`/propostas/${item.id}`}
                  >
                    v{item.version} · {item.number} · {item.status}
                  </Link>
                )}
              </li>
            ))}
          </ol>
          <p className="text-xs text-[var(--color-muted)]">
            Versões apresentadas são imutáveis; alterações exigem nova versão.
          </p>
        </Card>
      ) : null}
      {proposal.status === 'ACCEPTED' && canCreateSale ? (
        <Card className="space-y-3 p-6 print:hidden">
          <h3 className="text-lg font-semibold">Gerar venda</h3>
          <p className="text-sm text-[var(--color-muted)]">
            Proposta aceita não é venda concluída: ela inicia uma operação de
            venda com os valores congelados do item selecionado. A proposta
            histórica não é alterada.
          </p>
          <form className="grid gap-3" onSubmit={createSale}>
            <Field helpKey="sale.item" label="Item da proposta que gerou a venda" required>
              <Select name="proposalItemId" required defaultValue={proposal.items[0]?.id ?? ''}>
                {proposal.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.position} · {item.description}
                  </option>
                ))}
              </Select>
            </Field>
            <Field helpKey="sale.origin" label="Origem da venda">
              <Select name="origemVenda" defaultValue="CRM">
                <option value="SIMULADOR_PUBLICO">Simulador público</option>
                <option value="CRM">CRM</option>
                <option value="INDICACAO">Indicação</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="INSTAGRAM">Instagram</option>
                <option value="SITE">Site</option>
                <option value="MANUAL">Manual</option>
                <option value="OUTRO">Outro</option>
              </Select>
            </Field>
            <Button loading={loading} type="submit">
              Gerar venda
            </Button>
          </form>
        </Card>
      ) : null}
      {canEdit ? (
        <Card className="space-y-3 p-6 print:hidden">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">Editar rascunho</h3>
            <Button
              onClick={() => setEditing((current) => !current)}
              type="button"
              variant="outline"
            >
              {editing ? 'Fechar edição' : 'Editar'}
            </Button>
          </div>
          {editing ? (
            <form className="grid gap-3" onSubmit={saveEdit}>
              <Field label="Título">
                <Input defaultValue={proposal.title} maxLength={200} name="title" />
              </Field>
              <Field label="Resumo do objetivo">
                <textarea
                  className="min-h-20 w-full rounded-xl border p-3 text-sm"
                  defaultValue={proposal.objectiveSummary}
                  maxLength={1000}
                  name="objectiveSummary"
                />
              </Field>
              <Field label="Observações">
                <textarea
                  className="min-h-20 w-full rounded-xl border p-3 text-sm"
                  defaultValue={proposal.notes ?? ''}
                  maxLength={2000}
                  name="notes"
                />
              </Field>
              <Button loading={loading} type="submit">
                Salvar alterações
              </Button>
            </form>
          ) : null}
        </Card>
      ) : null}
      {canCreateVersion && proposal.status !== 'DRAFT' ? (
        <Card className="space-y-3 p-6 print:hidden">
          <h3 className="text-lg font-semibold">Nova versão</h3>
          <p className="text-sm text-[var(--color-muted)]">
            Cria a versão {proposal.version + 1} com os mesmos snapshots. A versão
            atual permanece preservada e imutável.
          </p>
          <Field label="Título da nova versão (opcional)">
            <Input
              maxLength={200}
              onChange={(event) => setVersionTitle(event.target.value)}
              placeholder={proposal.title}
              value={versionTitle}
            />
          </Field>
          <Button loading={loading} onClick={() => void createVersion()} type="button">
            Criar versão {proposal.version + 1}
          </Button>
        </Card>
      ) : null}
      {suggestFollowUp ? (
        <FollowUpSuggest leadId={proposal.leadId} leadNome={proposal.clientName} />
      ) : null}
      <div className="grid gap-5 xl:grid-cols-2">
        {proposal.items.map((item) => {
          const result = item.financialSnapshot;
          return (
            <Card className="p-6" key={item.id}>
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-primary)]">
                Cenário {item.position}
              </p>
              <h3 className="mt-1 text-xl font-semibold">{item.description}</h3>
              <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt>Crédito contratado</dt>
                  <dd className="font-semibold">
                    {money(result.contractedCredit)}
                  </dd>
                </div>
                <div>
                  <dt>Crédito líquido</dt>
                  <dd className="font-semibold">{money(result.netCredit)}</dd>
                </div>
                <div>
                  <dt>Parcela inicial</dt>
                  <dd className="font-semibold">
                    {money(result.initialInstallment)}
                  </dd>
                </div>
                <div>
                  <dt>Parcela posterior</dt>
                  <dd className="font-semibold">
                    {money(result.laterInstallment)}
                  </dd>
                </div>
                <div>
                  <dt>Lance total</dt>
                  <dd className="font-semibold">
                    {money(result.totalBidAmount)}
                  </dd>
                </div>
                <div>
                  <dt>Prazo restante</dt>
                  <dd className="font-semibold">
                    {result.remainingTermMonths} meses
                  </dd>
                </div>
              </dl>
              <p className="mt-5 text-xs text-[var(--color-muted)]">
                Regra {result.ruleVersion} ·{' '}
                {new Date(result.sourceDataUpdatedAt).toLocaleString('pt-BR')}
              </p>
            </Card>
          );
        })}
      </div>
      <div className="grid gap-5 lg:grid-cols-2 print:hidden">
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <Send className="h-5 w-5 text-[var(--color-primary)]" />
            <h3 className="text-lg font-semibold">Atualizar status</h3>
          </div>
          <form className="mt-4 space-y-4" onSubmit={status}>
            <Field helpKey="proposal.status" label="Novo status">
              <Select name="status">
                <option value="GENERATED">Gerada</option>
                <option value="SENT">Enviada</option>
                <option value="VIEWED">Visualizada</option>
                <option value="ACCEPTED">Aceita</option>
                <option value="REJECTED">Recusada</option>
                <option value="EXPIRED">Expirada</option>
                <option value="CANCELLED">Cancelada</option>
              </Select>
            </Field>
            <Field helpKey="proposal.reason" label="Motivo">
              <textarea
                className="min-h-20 w-full rounded-xl border p-3 text-sm"
                maxLength={500}
                name="reason"
              />
            </Field>
            <Button loading={loading} type="submit">
              Salvar status
            </Button>
          </form>
        </Card>
        <Card className="p-6">
          <h3 className="text-lg font-semibold">Histórico</h3>
          <ol className="mt-4 space-y-4 border-l-2 border-indigo-100 pl-5">
            {proposal.statusHistory.map((item) => (
              <li key={item.id}>
                <p className="font-semibold">{statusLabels[item.toStatus]}</p>
                <p className="text-sm text-[var(--color-muted)]">
                  {new Date(item.createdAt).toLocaleString('pt-BR')}
                </p>
                {item.reason ? (
                  <p className="mt-1 text-sm">{item.reason}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
