'use client';

import type {
  Administradora,
  AdministradoraListResponse,
  AuthResponse,
} from '@larcarvalho/shared';
import { ExternalLink, Pencil, Plus, Power } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';

import { formatCnpj } from '../lib/formatters';
import { Alert } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { EmptyState } from './ui/empty-state';
import { Field, Input } from './ui/field';
import { Modal } from './ui/modal';
import { Pagination } from './ui/pagination';

interface Feedback {
  readonly message: string;
  readonly tone: 'danger' | 'success';
}

function cnpjMask(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

async function mutate(path: string, method: 'PATCH' | 'POST', body: unknown) {
  const response = await fetch(path, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method,
  });
  if (!response.ok) {
    const payload = (await response.json()) as { error?: { message?: string } };
    throw new Error(
      payload.error?.message ?? 'Não foi possível concluir a ação',
    );
  }
}

function requestData(form: HTMLFormElement) {
  const data = new FormData(form);
  return {
    cnpj: data.get('cnpj'),
    codigoExterno: data.get('codigoExterno'),
    nome: data.get('nome'),
    nomeFantasia: data.get('nomeFantasia'),
    site: data.get('site'),
  };
}

export function AdministradorasManager({
  data,
  identity,
  search,
  status,
}: {
  readonly data: AdministradoraListResponse;
  readonly identity: AuthResponse;
  readonly search?: string;
  readonly status: 'ativas' | 'inativas' | 'todas';
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [editing, setEditing] = useState<Administradora | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<Administradora | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const canCreate = identity.permissions.includes('administradoras.create');
  const canUpdate = identity.permissions.includes('administradoras.update');
  const canDeactivate = identity.permissions.includes(
    'administradoras.deactivate',
  );

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const isEditing = editing !== null;
    setPending(isEditing ? 'edit' : 'create');
    setFeedback(null);
    try {
      await mutate(
        isEditing
          ? `/api/administradoras/${editing.id}`
          : '/api/administradoras',
        isEditing ? 'PATCH' : 'POST',
        requestData(form),
      );
      setEditing(null);
      setCreateOpen(false);
      formRef.current?.reset();
      setFeedback({
        message: isEditing
          ? 'Administradora atualizada com sucesso.'
          : 'Administradora criada com sucesso.',
        tone: 'success',
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        message:
          error instanceof Error ? error.message : 'Não foi possível salvar.',
        tone: 'danger',
      });
    } finally {
      setPending(null);
    }
  }

  async function confirmStatus() {
    if (!statusTarget) return;
    setPending('status');
    setFeedback(null);
    try {
      await mutate(`/api/administradoras/${statusTarget.id}/status`, 'PATCH', {
        ativa: !statusTarget.ativa,
      });
      setFeedback({
        message: `${statusTarget.nome} foi ${statusTarget.ativa ? 'desativada' : 'ativada'}.`,
        tone: 'success',
      });
      setStatusTarget(null);
      router.refresh();
    } catch (error) {
      setFeedback({
        message:
          error instanceof Error
            ? error.message
            : 'Não foi possível alterar o status.',
        tone: 'danger',
      });
    } finally {
      setPending(null);
    }
  }

  const closeForm = () => {
    formRef.current?.reset();
    setCreateOpen(false);
    setEditing(null);
  };
  const modalItem = editing;

  return (
    <>
      <div className="space-y-4">
        {feedback ? (
          <Alert tone={feedback.tone}>{feedback.message}</Alert>
        ) : null}
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
            <div>
              <h2 className="font-semibold">Administradoras cadastradas</h2>
              <p className="mt-0.5 text-sm text-[var(--color-muted)]">
                {data.total} {data.total === 1 ? 'registro' : 'registros'}
              </p>
            </div>
            {canCreate ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus aria-hidden="true" className="h-4 w-4" /> Nova
                administradora
              </Button>
            ) : null}
          </div>
          {data.items.length === 0 ? (
            <EmptyState
              description="Ajuste os filtros ou cadastre a primeira administradora autorizada."
              title="Nenhuma administradora encontrada"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="responsive-records w-full min-w-[58rem] border-collapse text-left text-sm">
                <thead className="bg-[var(--color-surface-subtle)] text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
                  <tr>
                    <th className="px-5 py-3">Administradora</th>
                    <th className="px-5 py-3">CNPJ</th>
                    <th className="px-5 py-3">Código externo</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {data.items.map((item) => (
                    <tr className="hover:bg-slate-50/70" key={item.id}>
                      <td data-label="Administradora" className="px-5 py-4">
                        <p className="font-semibold">{item.nome}</p>
                        {item.nomeFantasia ? (
                          <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                            {item.nomeFantasia}
                          </p>
                        ) : null}
                      </td>
                      <td
                        data-label="CNPJ"
                        className="technical-value px-5 py-4 text-[var(--color-text-soft)]"
                      >
                        {formatCnpj(item.cnpj)}
                      </td>
                      <td
                        data-label="Código externo"
                        className="technical-value px-5 py-4 text-[var(--color-text-soft)]"
                      >
                        {item.codigoExterno ?? '—'}
                      </td>
                      <td data-label="Status" className="px-5 py-4">
                        <Badge tone={item.ativa ? 'success' : 'neutral'}>
                          {item.ativa ? 'Ativa' : 'Inativa'}
                        </Badge>
                      </td>
                      <td data-label="Ações" className="px-5 py-4 text-right">
                        <div className="flex justify-end gap-1">
                          <Link
                            aria-label={`Ver ${item.nome}`}
                            className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius-md)] px-3 text-[var(--color-text-soft)] hover:bg-slate-100 hover:text-[var(--color-text)]"
                            href={`/dashboard/administradoras/${item.id}`}
                          >
                            <ExternalLink
                              aria-hidden="true"
                              className="h-4 w-4"
                            />
                          </Link>
                          {canUpdate ? (
                            <Button
                              aria-label={`Editar ${item.nome}`}
                              onClick={() => setEditing(item)}
                              variant="ghost"
                            >
                              <Pencil aria-hidden="true" className="h-4 w-4" />
                            </Button>
                          ) : null}
                          {canDeactivate ? (
                            <Button
                              aria-label={`${item.ativa ? 'Desativar' : 'Ativar'} ${item.nome}`}
                              onClick={() => setStatusTarget(item)}
                              variant="ghost"
                            >
                              <Power aria-hidden="true" className="h-4 w-4" />
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
            params={{ search, status }}
            totalPages={data.totalPages}
          />
        </Card>
      </div>

      <Modal
        description="CNPJ, URL e campos obrigatórios são validados antes do envio."
        onClose={closeForm}
        open={createOpen || modalItem !== null}
        title={modalItem ? 'Editar administradora' : 'Nova administradora'}
      >
        <form
          className="space-y-4"
          key={modalItem?.id ?? 'new'}
          onSubmit={save}
          ref={formRef}
        >
          <Field helpKey="administrator.name" label="Nome" required>
            <Input
              defaultValue={modalItem?.nome}
              maxLength={200}
              name="nome"
              required
            />
          </Field>
          <Field helpKey="administrator.tradeName" label="Nome fantasia">
            <Input
              defaultValue={modalItem?.nomeFantasia ?? ''}
              maxLength={200}
              name="nomeFantasia"
            />
          </Field>
          <Field
            helpKey="administrator.cnpj"
            help="Opcional; informe um CNPJ válido."
            label="CNPJ"
          >
            <Input
              defaultValue={
                modalItem
                  ? formatCnpj(modalItem.cnpj).replace('Não informado', '')
                  : ''
              }
              inputMode="numeric"
              maxLength={18}
              name="cnpj"
              onInput={(event) => {
                event.currentTarget.value = cnpjMask(event.currentTarget.value);
              }}
            />
          </Field>
          <Field helpKey="common.externalCode" label="Código externo">
            <Input
              defaultValue={modalItem?.codigoExterno ?? ''}
              maxLength={100}
              name="codigoExterno"
            />
          </Field>
          <Field
            helpKey="common.site"
            help="Use http:// ou https://"
            label="Site"
          >
            <Input
              defaultValue={modalItem?.site ?? ''}
              maxLength={2048}
              name="site"
              type="url"
            />
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <Button onClick={closeForm} variant="ghost">
              Cancelar
            </Button>
            <Button
              loading={pending === 'create' || pending === 'edit'}
              type="submit"
            >
              {modalItem ? 'Salvar alterações' : 'Criar administradora'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        {...(statusTarget
          ? {
              description: `A administradora ${statusTarget.nome} continuará preservada para auditoria e relacionamentos futuros.`,
            }
          : {})}
        onClose={() => setStatusTarget(null)}
        open={statusTarget !== null}
        title={
          statusTarget?.ativa
            ? 'Desativar administradora?'
            : 'Ativar administradora?'
        }
      >
        <div className="flex justify-end gap-3">
          <Button onClick={() => setStatusTarget(null)} variant="ghost">
            Cancelar
          </Button>
          <Button
            loading={pending === 'status'}
            onClick={() => void confirmStatus()}
            variant={statusTarget?.ativa ? 'danger' : 'primary'}
          >
            {statusTarget?.ativa
              ? 'Confirmar desativação'
              : 'Confirmar ativação'}
          </Button>
        </div>
      </Modal>
    </>
  );
}
