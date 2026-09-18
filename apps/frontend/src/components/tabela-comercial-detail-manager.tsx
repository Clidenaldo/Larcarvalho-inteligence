'use client';

import type {
  AuthResponse,
  TabelaComercial,
  TabelaComercialItem,
} from '@larcarvalho/shared';
import { Archive, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { EmptyState } from './ui/empty-state';
import { tableItemHelpKeys } from '../lib/form-help';
import { Field, Input, Select } from './ui/field';
import { Modal } from './ui/modal';
import { Pagination } from './ui/pagination';

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
    throw new Error(payload.error?.message ?? 'Não foi possível salvar o item');
  }
}
const value = (
  item: TabelaComercialItem | null,
  key: keyof TabelaComercialItem,
) => {
  const current = item?.[key];
  return current === null || current === undefined ? '' : String(current);
};

export function TabelaComercialDetailManager({
  tableId,
  table,
  identity,
  items,
}: {
  tableId: string;
  table: TabelaComercial;
  identity: AuthResponse;
  items: {
    items: readonly TabelaComercialItem[];
    page: number;
    total: number;
    totalPages: number;
  };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<TabelaComercialItem | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'danger';
    message: string;
  } | null>(null);
  const canCreate = identity.permissions.includes('tabelas_comerciais.create');
  const canUpdate = identity.permissions.includes('tabelas_comerciais.update');
  const canDelete = identity.permissions.includes('tabelas_comerciais.delete');
  const [destructiveAction, setDestructiveAction] = useState<
    'archive' | 'restore' | 'delete' | null
  >(null);
  const [confirmation, setConfirmation] = useState('');
  async function applyTableAction() {
    if (!destructiveAction) return;
    setPending(true);
    try {
      const method = destructiveAction === 'restore' ? 'POST' : 'PATCH';
      await mutate(
        `/api/tabelas-comerciais/${tableId}/${destructiveAction}`,
        destructiveAction === 'delete' ? 'DELETE' : method,
        destructiveAction === 'delete' ? { confirmation } : undefined,
      );
      setFeedback({
        tone: 'success',
        message:
          destructiveAction === 'archive'
            ? 'Tabela arquivada com sucesso.'
            : destructiveAction === 'restore'
              ? 'Tabela restaurada com sucesso.'
              : 'Tabela excluída definitivamente.',
      });
      setDestructiveAction(null);
      setConfirmation('');
      router.refresh();
    } catch (error) {
      setFeedback({
        tone: 'danger',
        message:
          error instanceof Error ? error.message : 'Falha ao atualizar tabela',
      });
    } finally {
      setPending(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = Object.fromEntries(
      [...new FormData(event.currentTarget).entries()]
        .map(([key, entry]) => [key, String(entry).trim()] as const)
        .filter(([, entry]) => entry !== ''),
    );
    setPending(true);
    try {
      await mutate(
        editing
          ? `/api/tabelas-comerciais/${tableId}/itens/${editing.id}`
          : `/api/tabelas-comerciais/${tableId}/itens`,
        editing ? 'PATCH' : 'POST',
        body,
      );
      setFeedback({
        tone: 'success',
        message: `Item ${editing ? 'atualizado' : 'criado'} com sucesso.`,
      });
      setEditing(null);
      setOpen(false);
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
  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b p-5">
          <div>
            <h2 className="font-semibold">Itens comerciais</h2>
            <p className="text-sm text-slate-500">{items.total} condições</p>
          </div>
          {canCreate ? (
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> Novo item
            </Button>
          ) : null}
        </div>
        {feedback ? (
          <div className="p-4">
            <Alert tone={feedback.tone}>{feedback.message}</Alert>
          </div>
        ) : null}
        {items.items.length === 0 ? (
          <EmptyState
            title="Nenhum item comercial"
            description="Cadastre manualmente ou use o importador existente."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  {[
                    'Crédito',
                    'Prazo',
                    'Modalidade',
                    'Primeira parcela',
                    'Demais parcelas',
                    'Parcela padrão',
                    'Seguro',
                    'Taxa antecipada',
                    'Ações',
                  ].map((label) => (
                    <th className="px-4 py-3" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.items.map((item) => (
                  <tr className="border-t" key={item.id}>
                    <td className="px-4 py-3">R$ {item.creditoReferencia}</td>
                    <td className="px-4 py-3">{item.prazoMeses} meses</td>
                    <td className="px-4 py-3">{item.modalidade}</td>
                    <td className="px-4 py-3">{item.primeiraParcela ?? '—'}</td>
                    <td className="px-4 py-3">{item.demaisParcelas ?? '—'}</td>
                    <td className="px-4 py-3">{item.parcelaPadrao ?? '—'}</td>
                    <td className="px-4 py-3">{item.seguro ?? '—'}</td>
                    <td className="px-4 py-3">
                      {item.taxaAntecipadaValor ??
                        item.taxaAntecipadaPercentual ??
                        '—'}
                    </td>
                    <td className="px-4 py-3">
                      {canUpdate ? (
                        <Button
                          variant="ghost"
                          aria-label="Editar item"
                          onClick={() => setEditing(item)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={items.page} totalPages={items.totalPages} />
      </Card>
      {canUpdate || canDelete ? (
        <Card className="p-5">
          <div className="flex flex-wrap gap-2">
            {table.deletedAt ? (
              canUpdate ? (
                <Button
                  variant="ghost"
                  onClick={() => setDestructiveAction('restore')}
                >
                  <RotateCcw className="h-4 w-4" /> Restaurar tabela
                </Button>
              ) : null
            ) : canUpdate ? (
              <Button
                variant="ghost"
                onClick={() => setDestructiveAction('archive')}
              >
                <Archive className="h-4 w-4" /> Arquivar tabela
              </Button>
            ) : null}
            {canDelete ? (
              <Button
                variant="ghost"
                onClick={() => setDestructiveAction('delete')}
              >
                <Trash2 className="h-4 w-4" /> Excluir definitivamente
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}
      <Modal
        open={destructiveAction !== null}
        onClose={() => {
          setDestructiveAction(null);
          setConfirmation('');
        }}
        title={
          destructiveAction === 'delete'
            ? 'Excluir tabela definitivamente'
            : destructiveAction === 'archive'
              ? 'Arquivar tabela'
              : 'Restaurar tabela'
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {destructiveAction === 'delete'
              ? 'Esta ação removerá definitivamente a tabela e seus itens. Não poderá ser desfeita.'
              : destructiveAction === 'archive'
                ? 'A tabela ficará fora das listagens ativas, mas seu histórico e itens serão preservados.'
                : 'A tabela voltará a aparecer nas listagens ativas.'}
          </p>
          {destructiveAction === 'delete' ? (
            <Field
              helpKey="table.delete"
              label="Digite EXCLUIR para confirmar"
              required
            >
              <Input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </Field>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDestructiveAction(null)}>
              Cancelar
            </Button>
            <Button
              disabled={
                pending ||
                (destructiveAction === 'delete' && confirmation !== 'EXCLUIR')
              }
              onClick={applyTableAction}
            >
              Confirmar
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={open || editing !== null}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
        title={editing ? 'Editar item comercial' : 'Novo item comercial'}
      >
        <form className="grid gap-4 md:grid-cols-2" onSubmit={save}>
          <Field helpKey="table.credit" label="Crédito de referência" required>
            <Input
              name="creditoReferencia"
              type="number"
              min="0.01"
              step="0.01"
              required
              defaultValue={value(editing, 'creditoReferencia')}
            />
          </Field>
          <Field helpKey="table.term" label="Prazo (meses)" required>
            <Input
              name="prazoMeses"
              type="number"
              min="1"
              max="1200"
              required
              defaultValue={value(editing, 'prazoMeses')}
            />
          </Field>
          <Field helpKey="table.mode" label="Modalidade" required>
            <Select
              name="modalidade"
              required
              defaultValue={value(editing, 'modalidade') || 'NORMAL'}
            >
              {['NORMAL', 'MAIS_POR_MENOS', 'OUTRA'].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </Field>
          <Field helpKey="common.externalCode" label="Código externo">
            <Input
              name="codigoExterno"
              defaultValue={value(editing, 'codigoExterno')}
            />
          </Field>
          {(
            [
              ['seguro', 'Seguro'],
              ['taxaAntecipadaValor', 'Taxa antecipada (valor)'],
              ['primeiraParcela', 'Primeira parcela'],
              ['demaisParcelas', 'Demais parcelas'],
              ['parcelaPadrao', 'Parcela padrão'],
            ] as const
          ).map(([name, label]) => (
            <Field helpKey={tableItemHelpKeys[name]} label={label} key={name}>
              <Input
                name={name}
                type="number"
                min="0"
                step="0.01"
                defaultValue={value(editing, name)}
              />
            </Field>
          ))}
          {(
            [
              ['taxaAntecipadaPercentual', 'Taxa antecipada (%)'],
              ['fundoReservaPercentual', 'Fundo de reserva (%)'],
              ['taxaAdministracaoPercentual', 'Taxa de administração (%)'],
              ['taxaTotalPercentual', 'Taxa total (%)'],
              ['seguroVidaPercentual', 'Seguro vida (%)'],
            ] as const
          ).map(([name, label]) => (
            <Field helpKey={tableItemHelpKeys[name]} label={label} key={name}>
              <Input
                name={name}
                type="number"
                min="0"
                max="100"
                step="0.000001"
                defaultValue={value(editing, name)}
              />
            </Field>
          ))}
          <Field helpKey="table.participants" label="Participantes">
            <Input
              name="participantesGrupo"
              type="number"
              min="0"
              defaultValue={value(editing, 'participantesGrupo')}
            />
          </Field>
          <Field helpKey="table.planCode" label="Código do plano">
            <Input
              name="codigoPlano"
              defaultValue={value(editing, 'codigoPlano')}
            />
          </Field>
          <div className="flex justify-end gap-3 md:col-span-2">
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
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
    </>
  );
}
