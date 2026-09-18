'use client';

import { FieldHelp } from './ui/field-help';

import type {
  AuthResponse,
  ManagedUser,
  UserListResponse,
  UserRole,
  Team,
} from '@larcarvalho/shared';
import { Plus, Power, UserCog, Eye, Shield, Edit } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';

import { formatDateTime } from '../lib/formatters';
import { roleLabels } from '../lib/identity';
import { Alert } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { EmptyState } from './ui/empty-state';
import { Field, Input, Select } from './ui/field';
import { Modal } from './ui/modal';
import { Pagination } from './ui/pagination';

interface Feedback {
  readonly message: string;
  readonly tone: 'danger' | 'success';
}

async function mutation(path: string, method: 'PATCH' | 'POST', body: unknown) {
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

function assignableRoles(actorRole: UserRole): readonly UserRole[] {
  return actorRole === 'SUPER_ADMIN'
    ? ['SUPER_ADMIN', 'ADMIN', 'GESTOR', 'VENDEDOR', 'OPERADOR']
    : ['GESTOR', 'VENDEDOR', 'OPERADOR'];
}

export function UsersManager({
  data,
  identity,
  teams = [],
}: {
  readonly data: UserListResponse;
  readonly identity: AuthResponse;
  readonly teams?: Team[];
}) {
  const router = useRouter();
  const createFormRef = useRef<HTMLFormElement>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<ManagedUser | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const canCreate = identity.permissions.includes('users.create');
  const canChangeRole = identity.permissions.includes('users.changeRole');
  const canDeactivate = identity.permissions.includes('users.deactivate');
  const roles = assignableRoles(identity.user.role);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending('create');
    setFeedback(null);
    try {
      await mutation('/api/users', 'POST', {
        email: form.get('email'),
        nome: form.get('nome'),
        password: form.get('password'),
        role: form.get('role'),
        telefoneWhatsapp: form.get('telefoneWhatsapp') || null,
        ...(identity.permissions.includes('teams.assign')
          ? { teamId: form.get('teamId') || null }
          : {}),
      });
      createFormRef.current?.reset();
      setCreateOpen(false);
      setFeedback({ message: 'Usuário criado com sucesso.', tone: 'success' });
      router.refresh();
    } catch (error) {
      setFeedback({
        message:
          error instanceof Error
            ? error.message
            : 'Não foi possível criar o usuário.',
        tone: 'danger',
      });
    } finally {
      setPending(null);
    }
  }

  async function changeRole(user: ManagedUser, role: UserRole) {
    setPending(`role-${user.id}`);
    setFeedback(null);
    try {
      await mutation(`/api/users/${user.id}/role`, 'PATCH', { role });
      setFeedback({
        message: `Papel de ${user.nome} atualizado.`,
        tone: 'success',
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        message:
          error instanceof Error
            ? error.message
            : 'Não foi possível alterar o papel.',
        tone: 'danger',
      });
    } finally {
      setPending(null);
    }
  }

  async function confirmStatus() {
    if (!statusTarget) return;
    setPending(`status-${statusTarget.id}`);
    setFeedback(null);
    try {
      await mutation(`/api/users/${statusTarget.id}/status`, 'PATCH', {
        ativo: !statusTarget.ativo,
      });
      setFeedback({
        message: `${statusTarget.nome} foi ${statusTarget.ativo ? 'desativado' : 'ativado'}.`,
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

  return (
    <>
      <div className="space-y-4">
        {feedback ? (
          <Alert tone={feedback.tone}>{feedback.message}</Alert>
        ) : null}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
            <div>
              <h3 className="font-semibold">Contas cadastradas</h3>
              <p className="mt-0.5 text-sm text-[var(--color-muted)]">
                {data.total} {data.total === 1 ? 'usuário' : 'usuários'}
              </p>
            </div>
            {canCreate ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus aria-hidden="true" className="h-4 w-4" />
                Novo usuário
              </Button>
            ) : null}
          </div>
          {data.items.length === 0 ? (
            <EmptyState
              description="Crie a primeira conta administrativa autorizada."
              title="Nenhum usuário encontrado"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
                <thead className="bg-[var(--color-surface-subtle)] text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
                  <tr>
                    <th className="px-5 py-3">Usuário</th>
                    <th className="px-5 py-3">Papel</th>
                    <th className="px-5 py-3">Gestor</th>
                    <th className="px-5 py-3">Equipe</th>
                    <th className="px-5 py-3">Último acesso</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {data.items.map((user) => {
                    const self = user.id === identity.user.id;
                    const manageable =
                      identity.user.role === 'SUPER_ADMIN' ||
                      !['SUPER_ADMIN', 'ADMIN'].includes(user.role);
                    return (
                      <tr className="hover:bg-slate-50/70" key={user.id}>
                        <td className="px-5 py-4">
                          <div className="font-semibold">
                            {user.nome}
                            {self ? (
                              <span className="ml-2 text-xs font-normal text-[var(--color-muted)]">
                                (você)
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-0.5 text-xs text-[var(--color-muted)]">
                            {user.email}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {canChangeRole && manageable && !self ? (
                            <div className="flex flex-wrap items-center gap-1">
                              <FieldHelp
                                helpKey="user.role"
                                label={`Papel de ${user.nome}`}
                              />
                              <Select
                                aria-label={`Papel de ${user.nome}`}
                                className="min-h-9 w-44 py-1"
                                disabled={pending === `role-${user.id}`}
                                onChange={(event) =>
                                  void changeRole(
                                    user,
                                    event.target.value as UserRole,
                                  )
                                }
                                value={user.role}
                              >
                                {roles.map((role) => (
                                  <option key={role} value={role}>
                                    {roleLabels[role]}
                                  </option>
                                ))}
</Select>
                            </div>
                          ) : (
                            <Badge tone="info">{roleLabels[user.role]}</Badge>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          {user.team?.manager?.nome ?? 'Sem gestor'}
                        </td>
                        <td className="px-5 py-4">
                          {user.team?.name ?? 'Sem equipe'}
                        </td>
                        <td className="px-5 py-4">
                          {user.ultimoLoginEm
                            ? formatDateTime(user.ultimoLoginEm)
                            : 'Nunca'}
                        </td>
                        <td className="px-5 py-4">
                          <Badge tone={user.ativo ? 'success' : 'neutral'}>
                            {user.ativo ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Button
                            aria-label={`Ver detalhes de ${user.nome}`}
                            className="mr-1"
                            variant="ghost"
                            onClick={() => router.push(`/dashboard/users/${user.id}`)}
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                          {canChangeRole && manageable && !self ? (
                            <Button
                              aria-label={`Editar ${user.nome}`}
                              className="mr-1"
                              variant="ghost"
                              onClick={() => router.push(`/dashboard/users/${user.id}/edit`)}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                          ) : null}
                          {identity.permissions.includes('users.permissions.manage') && manageable && !self ? (
                            <Button
                              aria-label={`Permissões de ${user.nome}`}
                              className="mr-1"
                              variant="ghost"
                              onClick={() => router.push(`/dashboard/users/${user.id}/permissions`)}
                            >
                              <Shield className="h-3 w-3" />
                            </Button>
                          ) : null}
                          {canDeactivate && manageable && !self ? (
                            <Button
                              aria-label={`${user.ativo ? 'Desativar' : 'Ativar'} ${user.nome}`}
                              className="mr-1"
                              variant="ghost"
                              onClick={() => setStatusTarget(user)}
                            >
                              <Power className="h-3 w-3" />
                            </Button>
                          ) : (
                            <span className="text-xs text-[var(--color-muted)]">
                              Sem ações
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={data.page} totalPages={data.totalPages} />
        </Card>
      </div>

      <Modal
        description="A senha inicial não será exibida novamente nem armazenada no navegador."
        onClose={() => {
          createFormRef.current?.reset();
          setCreateOpen(false);
        }}
        open={createOpen}
        title="Criar usuário"
      >
        <form className="space-y-4" onSubmit={createUser} ref={createFormRef}>
          <Field helpKey="user.name" label="Nome" required>
            <Input autoComplete="name" maxLength={200} name="nome" required />
          </Field>
          <Field helpKey="user.email" label="Email" required>
            <Input
              autoComplete="email"
              maxLength={254}
              name="email"
              required
              type="email"
            />
          </Field>
          <Field
            helpKey="user.password"
            help="Use uma frase-senha entre 12 e 128 caracteres."
            label="Senha inicial"
            required
          >
            <Input
              autoComplete="new-password"
              maxLength={128}
              minLength={12}
              name="password"
              required
              type="password"
            />
          </Field>
          <Field helpKey="user.phone" label="Telefone / WhatsApp">
            <Input name="telefoneWhatsapp" maxLength={30} />
          </Field>
          {identity.permissions.includes('teams.assign') && (
            <Field helpKey="user.team" label="Equipe">
              <Select name="teamId">
                <option value="">Sem equipe</option>
                {teams
                  .filter((team) => team.active)
                  .map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
              </Select>
            </Field>
          )}
          <Field helpKey="user.role" label="Papel" required>
            <Select defaultValue={roles.at(-1)} name="role" required>
              {roles.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              onClick={() => {
                createFormRef.current?.reset();
                setCreateOpen(false);
              }}
              variant="ghost"
            >
              Cancelar
            </Button>
            <Button loading={pending === 'create'} type="submit">
              <UserCog aria-hidden="true" className="h-4 w-4" />
              Criar usuário
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        {...(statusTarget
          ? {
              description: `Esta ação ${statusTarget.ativo ? 'revogará todas as sessões existentes' : 'permitirá novos acessos'} de ${statusTarget.nome}.`,
            }
          : {})}
        onClose={() => setStatusTarget(null)}
        open={statusTarget !== null}
        title={statusTarget?.ativo ? 'Desativar usuário?' : 'Ativar usuário?'}
      >
        <div className="flex justify-end gap-3">
          <Button onClick={() => setStatusTarget(null)} variant="ghost">
            Cancelar
          </Button>
          <Button
            loading={
              statusTarget ? pending === `status-${statusTarget.id}` : false
            }
            onClick={() => void confirmStatus()}
            variant={statusTarget?.ativo ? 'danger' : 'primary'}
          >
            {statusTarget?.ativo
              ? 'Confirmar desativação'
              : 'Confirmar ativação'}
          </Button>
        </div>
      </Modal>
    </>
  );
}
