'use client';

import type {
  Administradora,
  AuthResponse,
  Produto,
  TabelaComercial,
  TabelaComercialListQuery,
} from '@larcarvalho/shared';
import { ExternalLink, Pencil, Plus, Power, Upload } from 'lucide-react';
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

const categories = [
  'IMOVEL',
  'AUTOMOVEL',
  'MOTOCICLETA',
  'PESADOS',
  'SERVICOS',
  'OUTROS',
];
const statuses = ['ATIVA', 'INATIVA', 'ENCERRADA'] as const;

async function mutate(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
) {
  const response = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const payload = (await response.json()) as { error?: { message?: string } };
    throw new Error(
      payload.error?.message ?? 'Não foi possível concluir a ação',
    );
  }
}

function formBody(form: HTMLFormElement) {
  return Object.fromEntries(
    [...new FormData(form).entries()]
      .map(([key, value]) => [key, String(value).trim()] as const)
      .filter(([, value]) => value !== ''),
  );
}

export function TabelasComerciaisManager({
  data,
  identity,
  administradoras,
  produtos,
  params,
}: {
  data: {
    items: readonly TabelaComercial[];
    page: number;
    total: number;
    totalPages: number;
  };
  identity: AuthResponse;
  administradoras: readonly Administradora[];
  produtos: readonly Produto[];
  params: Partial<TabelaComercialListQuery>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<TabelaComercial | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<TabelaComercial | null>(
    null,
  );
  const [nextStatus, setNextStatus] =
    useState<(typeof statuses)[number]>('INATIVA');
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'danger';
    message: string;
  } | null>(null);
  const canCreate = identity.permissions.includes('tabelas_comerciais.create');
  const canUpdate = identity.permissions.includes('tabelas_comerciais.update');
  const canImport = identity.permissions.includes('tabelas_comerciais.import');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      await mutate(
        editing
          ? `/api/tabelas-comerciais/${editing.id}`
          : '/api/tabelas-comerciais',
        editing ? 'PATCH' : 'POST',
        formBody(event.currentTarget),
      );
      setFeedback({
        tone: 'success',
        message: `Tabela comercial ${editing ? 'atualizada' : 'criada'} com sucesso.`,
      });
      setEditing(null);
      setCreateOpen(false);
      router.refresh();
    } catch (error) {
      setFeedback({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Falha ao salvar',
      });
    } finally {
      setPending(false);
    }
  }

  async function changeStatus() {
    if (!statusTarget) return;
    setPending(true);
    try {
      await mutate(
        `/api/tabelas-comerciais/${statusTarget.id}/status`,
        'PATCH',
        { status: nextStatus },
      );
      setFeedback({
        tone: 'success',
        message: 'Status atualizado sem excluir o histórico.',
      });
      setStatusTarget(null);
      router.refresh();
    } catch (error) {
      setFeedback({
        tone: 'danger',
        message:
          error instanceof Error ? error.message : 'Falha ao alterar status',
      });
    } finally {
      setPending(false);
    }
  }

  const openStatus = (item: TabelaComercial) => {
    setStatusTarget(item);
    setNextStatus(item.status === 'ATIVA' ? 'INATIVA' : 'ATIVA');
  };

  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b p-5">
          <div>
            <h2 className="font-semibold">Tabelas cadastradas</h2>
            <p className="text-sm text-[var(--color-muted)]">
              {data.total} versões comerciais
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canImport ? (
              <Link
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-text)] shadow-[var(--shadow-sm)] hover:bg-slate-50"
                href="/dashboard/importacoes"
              >
                <Upload className="h-4 w-4" /> Importar tabela
              </Link>
            ) : null}
            {canCreate ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Nova tabela
              </Button>
            ) : null}
          </div>
        </div>
        {feedback ? (
          <div className="p-4">
            <Alert tone={feedback.tone}>{feedback.message}</Alert>
          </div>
        ) : null}
        {data.items.length === 0 ? (
          <EmptyState
            title="Nenhuma tabela comercial"
            description="Cadastre uma tabela ou ajuste os filtros."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="responsive-records min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  {[
                    'Código',
                    'Nome',
                    'Administradora',
                    'Categoria',
                    'Vigência',
                    'Status',
                    'Itens',
                    'Ações',
                  ].map((label) => (
                    <th className="px-4 py-3" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr className="border-t" key={item.id}>
                    <td
                      data-label="Código"
                      className="technical-value px-4 py-3 font-semibold"
                    >
                      {item.codigo}
                    </td>
                    <td data-label="Nome" className="px-4 py-3">
                      {item.nome}
                    </td>
                    <td data-label="Administradora" className="px-4 py-3">
                      {item.administradora.nome}
                    </td>
                    <td data-label="Categoria" className="px-4 py-3">
                      {item.categoria}
                    </td>
                    <td data-label="Vigência" className="px-4 py-3">
                      {item.inicioVigencia}
                      {item.fimVigencia ? ` a ${item.fimVigencia}` : ''}
                    </td>
                    <td data-label="Status" className="px-4 py-3">
                      <Badge
                        tone={item.status === 'ATIVA' ? 'success' : 'neutral'}
                      >
                        {item.status}
                      </Badge>
                    </td>
                    <td data-label="Itens" className="px-4 py-3">
                      {item.quantidadeItens}
                    </td>
                    <td data-label="Ações" className="px-4 py-3">
                      <div className="flex gap-1">
                        <Link
                          className="rounded-lg p-2 hover:bg-slate-100"
                          href={`/dashboard/tabelas-comerciais/${item.id}`}
                          aria-label="Abrir detalhes"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                        {canUpdate ? (
                          <Button
                            aria-label="Editar tabela"
                            variant="ghost"
                            onClick={() => setEditing(item)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        ) : null}
                        {canUpdate ? (
                          <Button
                            aria-label="Alterar status"
                            variant="ghost"
                            onClick={() => openStatus(item)}
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
          totalPages={data.totalPages}
          params={params as Record<string, string | undefined>}
        />
      </Card>
      <Modal
        open={createOpen || editing !== null}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
        title={editing ? 'Editar tabela comercial' : 'Nova tabela comercial'}
      >
        <form className="grid gap-4 md:grid-cols-2" onSubmit={save}>
          {!editing ? (
            <>
              <Field
                helpKey="common.administrator"
                label="Administradora"
                required
              >
                <Select name="administradoraId" required defaultValue="">
                  <option value="">Selecione</option>
                  {administradoras.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nome}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field helpKey="table.code" label="Código" required>
                <Input name="codigo" required />
              </Field>
              <Field helpKey="table.start" label="Início da vigência" required>
                <Input name="inicioVigencia" type="date" required />
              </Field>
            </>
          ) : null}
          <Field helpKey="table.name" label="Nome" required>
            <Input name="nome" required defaultValue={editing?.nome} />
          </Field>
          <Field helpKey="common.product" label="Produto">
            <Select name="produtoId" defaultValue={editing?.produtoId ?? ''}>
              <option value="">Sem produto</option>
              {produtos.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </Select>
          </Field>
          <Field helpKey="common.category" label="Categoria" required>
            <Select
              name="categoria"
              defaultValue={editing?.categoria ?? 'PESADOS'}
              required
            >
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </Field>
          {!editing ? (
            <Field helpKey="table.status" label="Status">
              <Select name="status" defaultValue="ATIVA">
                {statuses.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field helpKey="table.end" label="Fim da vigência">
            <Input
              name="fimVigencia"
              type="date"
              defaultValue={editing?.fimVigencia ?? ''}
            />
          </Field>
          <Field helpKey="table.index" label="Índice de correção">
            <Input
              name="indiceCorrecao"
              defaultValue={editing?.indiceCorrecao ?? ''}
            />
          </Field>
          <Field helpKey="fees.reserve" label="Fundo de reserva (%)">
            <Input
              name="fundoReservaPercentual"
              type="number"
              min="0"
              max="100"
              step="0.000001"
              defaultValue={editing?.fundoReservaPercentual ?? ''}
            />
          </Field>
          <Field helpKey="fees.admin" label="Taxa de administração (%)">
            <Input
              name="taxaAdministracaoPercentual"
              type="number"
              min="0"
              max="100"
              step="0.000001"
              defaultValue={editing?.taxaAdministracaoPercentual ?? ''}
            />
          </Field>
          <Field helpKey="fees.total" label="Taxa total (%)">
            <Input
              name="taxaTotalPercentual"
              type="number"
              min="0"
              max="100"
              step="0.000001"
              defaultValue={editing?.taxaTotalPercentual ?? ''}
            />
          </Field>
          <Field helpKey="fees.insurance" label="Seguro de vida (%)">
            <Input
              name="seguroVidaPercentual"
              type="number"
              min="0"
              max="100"
              step="0.000001"
              defaultValue={editing?.seguroVidaPercentual ?? ''}
            />
          </Field>
          <Field helpKey="table.participants" label="Participantes">
            <Input
              name="participantesGrupo"
              type="number"
              min="0"
              defaultValue={editing?.participantesGrupo ?? ''}
            />
          </Field>
          <Field helpKey="common.description" label="Descrição">
            <Input name="descricao" defaultValue={editing?.descricao ?? ''} />
          </Field>
          <div className="flex justify-end gap-3 md:col-span-2">
            <Button
              variant="ghost"
              onClick={() => {
                setCreateOpen(false);
                setEditing(null);
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={pending}>
              Salvar
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={statusTarget !== null}
        onClose={() => setStatusTarget(null)}
        title="Alterar status"
      >
        <div className="space-y-4">
          <Field helpKey="table.status" label="Novo status">
            <Select
              value={nextStatus}
              onChange={(event) =>
                setNextStatus(event.target.value as (typeof statuses)[number])
              }
            >
              {statuses.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </Field>
          <p className="text-sm text-slate-500">
            A versão será preservada; não há exclusão física.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setStatusTarget(null)}>
              Cancelar
            </Button>
            <Button loading={pending} onClick={() => void changeStatus()}>
              Confirmar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
