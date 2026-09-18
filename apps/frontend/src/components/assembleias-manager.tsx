'use client';
import type { Assembleia, AuthResponse } from '@larcarvalho/shared';
import { ExternalLink, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { formatDateTime } from '../lib/formatters';
import { Alert } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { EmptyState } from './ui/empty-state';
import { Field, Input, Select } from './ui/field';
import { Modal } from './ui/modal';
import { Pagination } from './ui/pagination';
const statuses = ['AGENDADA', 'REALIZADA', 'CANCELADA'];
type Group = {
  id: string;
  codigo: string;
  administradora: { nome: string };
  produto: { nome: string } | null;
};
async function mutate(path: string, method: 'POST' | 'PATCH', body: unknown) {
  const r = await fetch(path, {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  if (!r.ok) {
    const p = (await r.json()) as { error?: { message?: string } };
    throw new Error(p.error?.message ?? 'Não foi possível concluir');
  }
}
export function AssembleiasManager({
  data,
  identity,
  groups,
  params,
}: {
  data: {
    items: Assembleia[];
    page: number;
    total: number;
    totalPages: number;
  };
  identity: AuthResponse;
  groups: Group[];
  params: Record<string, string | undefined>;
}) {
  const router = useRouter(),
    [create, setCreate] = useState(false),
    [edit, setEdit] = useState<Assembleia | null>(null),
    [feedback, setFeedback] = useState<{
      tone: 'success' | 'danger';
      message: string;
    } | null>(null),
    [pending, setPending] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      body = {
        grupoId: f.get('grupoId'),
        numero: f.get('numero'),
        dataAssembleia: new Date(String(f.get('dataAssembleia'))).toISOString(),
        status: f.get('status'),
      };
    setPending(true);
    try {
      await mutate(
        edit ? `/api/assembleias/${edit.id}` : '/api/assembleias',
        edit ? 'PATCH' : 'POST',
        body,
      );
      setCreate(false);
      setEdit(null);
      setFeedback({ tone: 'success', message: 'Assembleia salva.' });
      router.refresh();
    } catch (x) {
      setFeedback({
        tone: 'danger',
        message: x instanceof Error ? x.message : 'Falha ao salvar',
      });
    } finally {
      setPending(false);
    }
  }
  const canCreate = identity.permissions.includes('assembleias.create'),
    canUpdate = identity.permissions.includes('assembleias.update');
  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <h2 className="font-semibold">Assembleias registradas</h2>
            <p className="text-sm text-[var(--color-muted)]">
              {data.total} registros
            </p>
          </div>
          {canCreate ? (
            <Button onClick={() => setCreate(true)}>
              <Plus className="h-4 w-4" />
              Nova assembleia
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
            title="Nenhuma assembleia encontrada"
            description="Ajuste os filtros ou registre a primeira assembleia."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[55rem] text-left text-sm">
              <thead className="bg-[var(--color-surface-subtle)] text-xs uppercase text-[var(--color-muted)]">
                <tr>
                  <th className="p-4">Assembleia</th>
                  <th className="p-4">Grupo</th>
                  <th className="p-4">Data</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.items.map((a) => (
                  <tr key={a.id}>
                    <td className="p-4 font-semibold">
                      {a.numero ?? 'Sem número'}
                    </td>
                    <td className="p-4">
                      {a.grupo.administradora.nome} · {a.grupo.codigo}
                    </td>
                    <td className="p-4">{formatDateTime(a.dataAssembleia)}</td>
                    <td className="p-4">
                      <Badge
                        tone={
                          a.status === 'REALIZADA'
                            ? 'success'
                            : a.status === 'CANCELADA'
                              ? 'danger'
                              : 'info'
                        }
                      >
                        {a.status}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-end gap-1">
                        <Link
                          className="rounded-lg p-2 hover:bg-slate-100"
                          href={`/dashboard/assembleias/${a.id}`}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                        {canUpdate ? (
                          <Button onClick={() => setEdit(a)} variant="ghost">
                            <Pencil className="h-4 w-4" />
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
        open={create || edit !== null}
        onClose={() => {
          setCreate(false);
          setEdit(null);
        }}
        title={edit ? 'Editar assembleia' : 'Nova assembleia'}
      >
        <form className="space-y-4" onSubmit={save}>
          <Field helpKey="common.group" label="Grupo" required>
            <Select defaultValue={edit?.grupoId} name="grupoId" required>
              <option value="">Selecione</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.administradora.nome} · {g.produto?.nome ?? 'Sem produto'} ·{' '}
                  {g.codigo}
                </option>
              ))}
            </Select>
          </Field>
          <Field helpKey="assembly.number" label="Número">
            <Input defaultValue={edit?.numero ?? ''} name="numero" />
          </Field>
          <Field helpKey="assembly.date" label="Data" required>
            <Input
              defaultValue={edit?.dataAssembleia.slice(0, 16)}
              name="dataAssembleia"
              type="datetime-local"
              required
            />
          </Field>
          <Field helpKey="assembly.status" label="Status" required>
            <Select defaultValue={edit?.status ?? 'AGENDADA'} name="status">
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-3">
            <Button
              onClick={() => {
                setCreate(false);
                setEdit(null);
              }}
              variant="ghost"
            >
              Cancelar
            </Button>
            <Button loading={pending} type="submit">
              Salvar
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
