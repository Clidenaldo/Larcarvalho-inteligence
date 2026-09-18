'use client';
import type { AuthResponse } from '@larcarvalho/shared';
import { Pencil, Plus, Power, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { EmptyState } from './ui/empty-state';
import { Field, Input, Select } from './ui/field';
import { Modal } from './ui/modal';
import { Pagination } from './ui/pagination';
type Kind = 'produtos' | 'grupos' | 'cotas';
type Row = Record<string, unknown>;
type Option = { id: string; nome?: string; codigo?: string };
const statuses = ['ATIVO', 'INATIVO', 'ENCERRADO', 'SUSPENSO', 'OUTRO'];
const categories = [
  'IMOVEL',
  'AUTOMOVEL',
  'MOTOCICLETA',
  'PESADOS',
  'SERVICOS',
  'OUTROS',
];
async function mutate(path: string, method: 'POST' | 'PATCH', body: unknown) {
  const r = await fetch(path, {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  if (!r.ok) {
    const p = (await r.json()) as { error?: { message?: string } };
    throw new Error(p.error?.message ?? 'Não foi possível concluir a ação');
  }
}
function value(row: Row | null, key: string) {
  const v = row?.[key];
  return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
}
function title(kind: Kind) {
  return kind === 'produtos' ? 'Produto' : kind === 'grupos' ? 'Grupo' : 'Cota';
}
export function OperacionalManager({
  kind,
  data,
  identity,
  administradoras = [],
  produtos = [],
  grupos = [],
  params = {},
}: {
  kind: Kind;
  data: {
    items: readonly Row[];
    page: number;
    total: number;
    totalPages: number;
  };
  identity: AuthResponse;
  administradoras?: readonly Option[];
  produtos?: readonly Option[];
  grupos?: readonly Option[];
  params?: Readonly<Record<string, string | undefined>>;
}) {
  const router = useRouter(),
    [editing, setEditing] = useState<Row | null>(null),
    [createOpen, setCreateOpen] = useState(false),
    [statusTarget, setStatusTarget] = useState<Row | null>(null),
    [pending, setPending] = useState<string | null>(null),
    [feedback, setFeedback] = useState<{
      tone: 'success' | 'danger';
      message: string;
    } | null>(null);
  const singular = title(kind),
    prefix = kind;
  const can = (action: string) =>
    identity.permissions.includes(`${prefix}.${action}` as never);
  const id = (row: Row) => String(row.id);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const body = Object.fromEntries(
      [...f.entries()].map(([k, v]) => [k, v === '' ? undefined : v]),
    );
    setPending('save');
    try {
      await mutate(
        editing ? `/api/${kind}/${id(editing)}` : `/api/${kind}`,
        editing ? 'PATCH' : 'POST',
        body,
      );
      setFeedback({
        tone: 'success',
        message: `${singular} ${editing ? 'atualizado' : 'criado'} com sucesso.`,
      });
      setEditing(null);
      setCreateOpen(false);
      router.refresh();
    } catch (e) {
      setFeedback({
        tone: 'danger',
        message: e instanceof Error ? e.message : 'Falha ao salvar.',
      });
    } finally {
      setPending(null);
    }
  }
  async function updateStatus() {
    if (!statusTarget) return;
    setPending('status');
    try {
      const current =
        kind === 'produtos'
          ? Boolean(statusTarget.ativo)
          : String(statusTarget.status);
      const body =
        kind === 'produtos'
          ? { ativo: !current }
          : { status: current === 'ATIVO' ? 'INATIVO' : 'ATIVO' };
      await mutate(`/api/${kind}/${id(statusTarget)}/status`, 'PATCH', body);
      setStatusTarget(null);
      setFeedback({ tone: 'success', message: 'Status atualizado.' });
      router.refresh();
    } catch (e) {
      setFeedback({
        tone: 'danger',
        message: e instanceof Error ? e.message : 'Falha ao atualizar status.',
      });
    } finally {
      setPending(null);
    }
  }
  const rowName = (r: Row) =>
    kind === 'produtos'
      ? String(r.nome)
      : kind === 'grupos'
        ? String(r.codigo)
        : String(r.numero);
  const active = (r: Row) =>
    kind === 'produtos' ? Boolean(r.ativo) : String(r.status) === 'ATIVO';
  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <h2 className="font-semibold">{singular}s cadastrados</h2>
            <p className="text-sm text-[var(--color-muted)]">
              {data.total} registros
            </p>
          </div>
          {can('create') ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Novo {singular.toLowerCase()}
            </Button>
          ) : null}
        </div>
        {feedback ? (
          <div className="p-4">
            <Alert tone={feedback.tone}>{feedback.message}</Alert>
          </div>
        ) : null}
        {data.items.length === 0 ? (
          <EmptyState
            title={`Nenhum ${singular.toLowerCase()} encontrado`}
            description="Ajuste os filtros ou cadastre o primeiro registro autorizado."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="bg-[var(--color-surface-subtle)] text-xs uppercase text-[var(--color-muted)]">
                <tr>
                  <th className="px-5 py-3">{singular}</th>
                  <th className="px-5 py-3">Relacionamento</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {data.items.map((r) => (
                  <tr key={id(r)}>
                    <td className="px-5 py-4 font-semibold">{rowName(r)}</td>
                    <td className="px-5 py-4 text-[var(--color-text-soft)]">
                      {kind === 'produtos'
                        ? String((r.administradora as Row)?.nome ?? '—')
                        : kind === 'grupos'
                          ? String((r.administradora as Row)?.nome ?? '—')
                          : String((r.grupo as Row)?.codigo ?? '—')}
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={active(r) ? 'success' : 'neutral'}>
                        {kind === 'produtos'
                          ? active(r)
                            ? 'Ativo'
                            : 'Inativo'
                          : String(r.status)}
                      </Badge>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <Link
                          className="rounded-lg p-2 hover:bg-slate-100"
                          href={`/dashboard/${kind}/${id(r)}`}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                        {can('update') ? (
                          <Button
                            aria-label="Editar"
                            onClick={() => setEditing(r)}
                            variant="ghost"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        ) : null}
                        {can('deactivate') ? (
                          <Button
                            aria-label="Alterar status"
                            onClick={() => setStatusTarget(r)}
                            variant="ghost"
                          >
                            <Power className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={data.page}
          params={params}
          totalPages={data.totalPages}
        />
      </Card>
      <Modal
        open={createOpen || editing !== null}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
        title={editing ? `Editar ${singular}` : `Novo ${singular}`}
      >
        <form className="space-y-4" onSubmit={save}>
          {kind === 'produtos' ? (
            <>
              <Field
                helpKey="common.administrator"
                label="Administradora"
                required
              >
                <Select
                  defaultValue={value(editing, 'administradoraId')}
                  name="administradoraId"
                  required
                >
                  <option value="">Selecione</option>
                  {administradoras.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field helpKey="product.name" label="Nome" required>
                <Input
                  defaultValue={value(editing, 'nome')}
                  name="nome"
                  required
                />
              </Field>
              <Field helpKey="common.category" label="Categoria" required>
                <Select
                  defaultValue={value(editing, 'categoria')}
                  name="categoria"
                  required
                >
                  {categories.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </Select>
              </Field>
              <Field helpKey="common.description" label="Descrição">
                <Input
                  defaultValue={value(editing, 'descricao')}
                  name="descricao"
                />
              </Field>
              <Field helpKey="common.externalCode" label="Código externo">
                <Input
                  defaultValue={value(editing, 'codigoExterno')}
                  name="codigoExterno"
                />
              </Field>
            </>
          ) : kind === 'grupos' ? (
            <>
              <Field
                helpKey="common.administrator"
                label="Administradora"
                required
              >
                <Select
                  defaultValue={value(editing, 'administradoraId')}
                  name="administradoraId"
                  required
                >
                  <option value="">Selecione</option>
                  {administradoras.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field helpKey="common.product" label="Produto">
                <Select
                  defaultValue={value(editing, 'produtoId')}
                  name="produtoId"
                >
                  <option value="">Não classificado</option>
                  {produtos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field helpKey="group.code" label="Código" required>
                <Input
                  defaultValue={value(editing, 'codigo')}
                  name="codigo"
                  required
                />
              </Field>
              <Field helpKey="group.status" label="Status" required>
                <Select
                  defaultValue={value(editing, 'status') || 'ATIVO'}
                  name="status"
                >
                  {statuses.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </Select>
              </Field>
              <Field helpKey="group.start" label="Data início">
                <Input
                  defaultValue={value(editing, 'dataInicio')}
                  name="dataInicio"
                  type="date"
                />
              </Field>
              <Field helpKey="group.end" label="Data encerramento">
                <Input
                  defaultValue={value(editing, 'dataEncerramento')}
                  name="dataEncerramento"
                  type="date"
                />
              </Field>
              <Field helpKey="group.term" label="Prazo (meses)">
                <Input
                  defaultValue={value(editing, 'prazoMeses')}
                  min="1"
                  name="prazoMeses"
                  type="number"
                />
              </Field>
              <Field helpKey="group.quotas" label="Quantidade de cotas">
                <Input
                  defaultValue={value(editing, 'quantidadeCotas')}
                  min="0"
                  name="quantidadeCotas"
                  type="number"
                />
              </Field>
              <Field helpKey="group.minCredit" label="Crédito mínimo">
                <Input
                  defaultValue={value(editing, 'valorCreditoMinimo')}
                  min="0"
                  name="valorCreditoMinimo"
                  step="0.01"
                  type="number"
                />
              </Field>
              <Field helpKey="group.maxCredit" label="Crédito máximo">
                <Input
                  defaultValue={value(editing, 'valorCreditoMaximo')}
                  min="0"
                  name="valorCreditoMaximo"
                  step="0.01"
                  type="number"
                />
              </Field>
            </>
          ) : (
            <>
              <Field helpKey="common.group" label="Grupo" required>
                <Select
                  defaultValue={value(editing, 'grupoId')}
                  name="grupoId"
                  required
                >
                  <option value="">Selecione</option>
                  {grupos.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.codigo}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field helpKey="quota.number" label="Número" required>
                <Input
                  defaultValue={value(editing, 'numero')}
                  name="numero"
                  required
                />
              </Field>
              <Field helpKey="quota.status" label="Status" required>
                <Select
                  defaultValue={value(editing, 'status') || 'ATIVO'}
                  name="status"
                >
                  {statuses.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </Select>
              </Field>
              <Field helpKey="quota.credit" label="Valor de crédito">
                <Input
                  defaultValue={value(editing, 'valorCredito')}
                  min="0"
                  name="valorCredito"
                  step="0.01"
                  type="number"
                />
              </Field>
              <Field helpKey="quota.remaining" label="Prazo restante">
                <Input
                  defaultValue={value(editing, 'prazoRestante')}
                  min="0"
                  name="prazoRestante"
                  type="number"
                />
              </Field>
              <Field helpKey="quota.installment" label="Parcela atual">
                <Input
                  defaultValue={value(editing, 'parcelaAtual')}
                  min="0"
                  name="parcelaAtual"
                  step="0.01"
                  type="number"
                />
              </Field>
              <Field helpKey="common.externalCode" label="Código externo">
                <Input
                  defaultValue={value(editing, 'codigoExterno')}
                  name="codigoExterno"
                />
              </Field>
            </>
          )}
          <div className="flex justify-end gap-3">
            <Button
              onClick={() => {
                setCreateOpen(false);
                setEditing(null);
              }}
              variant="ghost"
            >
              Cancelar
            </Button>
            <Button loading={pending === 'save'} type="submit">
              Salvar
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={statusTarget !== null}
        onClose={() => setStatusTarget(null)}
        title="Alterar status?"
      >
        <p className="mb-4 text-sm text-[var(--color-text-soft)]">
          O histórico será preservado; nenhuma relação será desativada em
          cascata.
        </p>
        <div className="flex justify-end gap-3">
          <Button onClick={() => setStatusTarget(null)} variant="ghost">
            Cancelar
          </Button>
          <Button
            loading={pending === 'status'}
            onClick={() => void updateStatus()}
          >
            {active(statusTarget ?? {}) ? 'Desativar' : 'Ativar'}
          </Button>
        </div>
      </Modal>
    </>
  );
}
