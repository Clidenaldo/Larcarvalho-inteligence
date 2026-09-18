'use client';
import { FieldHelp } from './ui/field-help';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type {
  AuthResponse,
  ManagedUser,
  Permission,
  PermissionMatrix,
  PermissionOverride,
  Team,
  UserPermissions,
} from '@larcarvalho/shared';
import { roleLabels } from '../lib/identity';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Alert } from './ui/alert';
import { Field, Input, Select } from './ui/field';

export async function accessMutation(
  path: string,
  method: string,
  body: unknown,
) {
  const response = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = (await response.json()) as { error?: { message?: string } };
    throw new Error(payload.error?.message ?? 'Não foi possível salvar');
  }
}

const actionLabels: Record<string, string> = {
  read: 'Visualizar',
  read_own: 'Visualizar próprios',
  read_team: 'Visualizar equipe',
  read_all: 'Visualizar todos',
  update_own: 'Alterar próprios',
  update_team: 'Alterar equipe',
  update_all: 'Alterar todos',
  delete_own: 'Excluir próprios',
  delete_team: 'Excluir da equipe',
  delete_all: 'Excluir todos',
  create: 'Criar',
  update: 'Alterar',
  export: 'Exportar',
  assign: 'Atribuir responsável',
  change_status: 'Alterar status',
  add_interaction: 'Registrar interação',
  manage: 'Gerenciar',
  reset_password: 'Redefinir senha',
  changeRole: 'Alterar papel',
  deactivate: 'Ativar e desativar',
};
const moduleLabels: Record<string, string> = {
  leads: 'CRM',
  simulations: 'Simulações',
  proposals: 'Propostas',
  users: 'Usuários',
  teams: 'Equipes',
  themes: 'Aparência',
  dashboard: 'Dashboard',
  audit: 'Auditoria',
  analytics: 'Relatórios de tráfego',
  commercial_config: 'Configuração comercial',
  commercial_rules: 'Regras comerciais',
};

export function UserAccessEditor({
  user,
  identity,
  teams,
  access,
  matrix,
}: {
  user: ManagedUser;
  identity: AuthResponse;
  teams: Team[];
  access: UserPermissions | null;
  matrix: PermissionMatrix | null;
}) {
  const router = useRouter();
  const [overrides, setOverrides] = useState<PermissionOverride[]>(
    access?.overrides ?? [],
  );
  const [feedback, setFeedback] = useState<{
    message: string;
    tone: 'success' | 'danger';
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [search, setSearch] = useState('');
  const canEdit =
    user.id !== identity.user.id &&
    (identity.user.role === 'SUPER_ADMIN' ||
      (identity.user.role === 'ADMIN' &&
        !['SUPER_ADMIN', 'ADMIN'].includes(user.role)));
  async function save(task: () => Promise<void>) {
    setPending(true);
    setFeedback(null);
    try {
      await task();
      setFeedback({ message: 'Alterações salvas.', tone: 'success' });
      router.refresh();
    } catch (error) {
      setFeedback({
        message: error instanceof Error ? error.message : 'Falha ao salvar',
        tone: 'danger',
      });
    } finally {
      setPending(false);
    }
  }
  function details(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void save(() =>
      accessMutation(`/api/users/${user.id}`, 'PATCH', {
        nome: form.get('nome'),
        email: form.get('email'),
        telefoneWhatsapp: form.get('telefoneWhatsapp') || null,
        ...(identity.permissions.includes('teams.assign')
          ? { teamId: form.get('teamId') || null }
          : {}),
        ...(user.role === 'VENDEDOR'
          ? {
              sellerProfile: {
                registration: form.get('registration') || null,
                hiredAt: form.get('hiredAt') || null,
                notes: form.get('notes') || null,
              },
            }
          : {}),
      }),
    );
  }
  const groups = [
    ...new Set(
      matrix?.permissions.map((permission) => permission.split('.')[0]!) ?? [],
    ),
  ];
  const defaults = new Set(access?.roleDefaults);
  const effective = (permission: Permission) =>
    overrides.find((entry) => entry.permission === permission)?.effect ===
    'DENY'
      ? false
      : overrides.find((entry) => entry.permission === permission)?.effect ===
          'ALLOW' || defaults.has(permission);
  return (
    <div className="space-y-6">
      {feedback && <Alert tone={feedback.tone}>{feedback.message}</Alert>}
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">Dados de {user.nome}</h2>
        <p className="mb-4 text-sm">
          {roleLabels[user.role]} · {user.ativo ? 'Ativo' : 'Inativo'} · Gestor:{' '}
          {user.team?.manager?.nome ?? 'Não definido'}
        </p>
        <form onSubmit={details} className="grid gap-4 md:grid-cols-2">
          <Field helpKey="user.name" label="Nome">
            <Input
              name="nome"
              defaultValue={user.nome}
              required
              maxLength={200}
            />
          </Field>
          <Field helpKey="user.email" label="Email">
            <Input
              name="email"
              type="email"
              defaultValue={user.email}
              required
            />
          </Field>
          <Field helpKey="user.phone" label="Telefone / WhatsApp">
            <Input
              name="telefoneWhatsapp"
              defaultValue={user.telefoneWhatsapp ?? ''}
              maxLength={30}
            />
          </Field>
          <Field helpKey="user.team" label="Equipe">
            <Select
              name="teamId"
              defaultValue={user.teamId ?? ''}
              disabled={!identity.permissions.includes('teams.assign')}
            >
              <option value="">Sem equipe</option>
              {teams
                .filter((team) => team.active || team.id === user.teamId)
                .map((team) => (
                  <option value={team.id} key={team.id}>
                    {team.name}
                    {team.active ? '' : ' (inativa)'}
                  </option>
                ))}
            </Select>
          </Field>
          {user.role === 'VENDEDOR' && (
            <>
              <Field helpKey="user.registration" label="Matrícula comercial">
                <Input
                  name="registration"
                  defaultValue={user.sellerProfile?.registration ?? ''}
                  maxLength={80}
                />
              </Field>
              <Field helpKey="user.hired" label="Data de entrada">
                <Input
                  name="hiredAt"
                  type="date"
                  defaultValue={user.sellerProfile?.hiredAt ?? ''}
                />
              </Field>
              <Field helpKey="common.notes" label="Observações do vendedor">
                <Input
                  name="notes"
                  defaultValue={user.sellerProfile?.notes ?? ''}
                  maxLength={2000}
                />
              </Field>
            </>
          )}
          {canEdit && identity.permissions.includes('users.update') && (
            <div className="md:col-span-2">
              <Button loading={pending} type="submit">
                Salvar dados
              </Button>
            </div>
          )}
        </form>
      </Card>
      {access && matrix && (
        <Card className="space-y-4 p-6">
          <h2 className="text-lg font-semibold">Permissões personalizadas</h2>
          <p className="text-sm text-[var(--color-muted)]">
            Herdar usa o papel {roleLabels[user.role]}. Permitir concede a ação;
            negar a bloqueia. OWN: próprios registros. TEAM: equipes ativas
            vinculadas. ALL: todos os registros.
          </p>
          <div className="flex flex-wrap gap-3">
            <Input
              aria-label="Buscar permissão"
              placeholder="Buscar módulo ou permissão"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button
              variant="outline"
              disabled={!canEdit || pending || user.role === 'SUPER_ADMIN'}
              onClick={() =>
                setOverrides(
                  overrides.filter(
                    (entry) => !matrix.delegable.includes(entry.permission),
                  ),
                )
              }
            >
              Restaurar padrão do papel
            </Button>
          </div>
          {groups.map((group) => {
            const entries = matrix.permissions.filter(
              (permission) =>
                permission.startsWith(`${group}.`) &&
                `${permission} ${moduleLabels[group] ?? group}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
            );
            return entries.length ? (
              <fieldset
                key={group}
                className="rounded-xl border border-[var(--color-border)] p-4"
              >
                <legend className="px-2 font-semibold">
                  {moduleLabels[group] ?? group.replaceAll('_', ' ')}
                </legend>
                <div className="space-y-3">
                  {entries.map((permission) => (
                    <div
                      key={permission}
                      className="grid items-center gap-2 sm:grid-cols-[1fr_12rem_6rem]"
                    >
                      <div className="flex flex-wrap items-center gap-1 text-sm">
                        <FieldHelp
                          helpKey="user.permission"
                          label={permission}
                        />
                        {actionLabels[
                          permission.split('.').slice(1).join('.')
                        ] ??
                          permission
                            .split('.')
                            .slice(1)
                            .join(' ')
                            .replaceAll('_', ' ')}
                        <code className="block text-xs text-[var(--color-muted)]">
                          {permission}
                        </code>
                      </div>
                      <Select
                        aria-label={permission}
                        disabled={
                          !canEdit ||
                          pending ||
                          !matrix.delegable.includes(permission) ||
                          user.role === 'SUPER_ADMIN'
                        }
                        value={
                          overrides.find(
                            (entry) => entry.permission === permission,
                          )?.effect ?? 'INHERIT'
                        }
                        onChange={(event) =>
                          setOverrides([
                            ...overrides.filter(
                              (entry) => entry.permission !== permission,
                            ),
                            ...(event.target.value === 'INHERIT'
                              ? []
                              : [
                                  {
                                    permission,
                                    effect: event.target.value as
                                      'ALLOW' | 'DENY',
                                  },
                                ]),
                          ])
                        }
                      >
                        <option value="INHERIT">
                          Herdar (
                          {defaults.has(permission) ? 'permitido' : 'negado'})
                        </option>
                        <option value="ALLOW">Permitir</option>
                        <option value="DENY">Negar</option>
                      </Select>
                      <span className="text-xs">
                        {effective(permission) ? 'Permitido' : 'Negado'}
                      </span>
                    </div>
                  ))}
                </div>
              </fieldset>
            ) : null;
          })}
          {canEdit && user.role !== 'SUPER_ADMIN' && (
            <Button
              loading={pending}
              onClick={() =>
                void save(() =>
                  accessMutation(`/api/users/${user.id}/permissions`, 'PUT', {
                    overrides,
                  }),
                )
              }
            >
              Salvar permissões
            </Button>
          )}
          <details>
            <summary className="cursor-pointer font-medium">
              Matriz real dos papéis
            </summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr>
                    <th className="p-2">Permissão</th>
                    {matrix.roles.map((role) => (
                      <th className="p-2" key={role.role}>
                        {roleLabels[role.role]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.permissions.map((permission) => (
                    <tr key={permission}>
                      <td className="p-2">{permission}</td>
                      {matrix.roles.map((role) => (
                        <td className="p-2" key={role.role}>
                          {role.permissions.includes(permission)
                            ? 'Sim'
                            : 'Não'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Card>
      )}
      {canEdit && identity.permissions.includes('users.reset_password') && (
        <Card className="p-6">
          <h2 className="mb-2 font-semibold">Redefinir senha</h2>
          <p className="mb-4 text-sm text-[var(--color-muted)]">
            As sessões deste usuário serão encerradas. Entregue a nova senha por
            um canal seguro.
          </p>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const password = new FormData(form).get('password');
              void save(async () => {
                await accessMutation(
                  `/api/users/${user.id}/reset-password`,
                  'POST',
                  { password },
                );
                form.reset();
              });
            }}
          >
            <Field helpKey="user.password" label="Nova senha">
              <Input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </Field>
            <Button loading={pending} type="submit">
              Redefinir e encerrar sessões
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
