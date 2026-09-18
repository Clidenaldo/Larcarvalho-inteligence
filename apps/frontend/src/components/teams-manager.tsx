'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { AuthResponse, ManagedUser, Team } from '@larcarvalho/shared';
import { accessMutation } from './user-access-editor';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Field, Input, Select } from './ui/field';
export function TeamsManager({
  teams,
  users,
  identity,
}: {
  teams: Team[];
  users: ManagedUser[];
  identity: AuthResponse;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Team | null>(null);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'danger';
    message: string;
  } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setFeedback(null);
    try {
      await accessMutation(
        editing ? `/api/teams/${editing.id}` : '/api/teams',
        editing ? 'PATCH' : 'POST',
        {
          name: data.get('name'),
          description: data.get('description') || null,
          managerId: data.get('managerId') || null,
          active: data.get('active') === 'true',
        },
      );
      setEditing(null);
      form.reset();
      setFeedback({ tone: 'success', message: 'Equipe salva.' });
      router.refresh();
    } catch (error) {
      setFeedback({
        tone: 'danger',
        message:
          error instanceof Error ? error.message : 'Falha ao salvar equipe',
      });
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-6">
      {feedback && <Alert tone={feedback.tone}>{feedback.message}</Alert>}
      {(identity.permissions.includes('teams.create') || editing) && (
        <Card className="p-6">
          <h2 className="mb-4 font-semibold">
            {editing ? `Editar ${editing.name}` : 'Nova equipe'}
          </h2>
          <form
            key={editing?.id ?? 'new'}
            onSubmit={submit}
            className="grid gap-4 md:grid-cols-2"
          >
            <Field helpKey="team.name" label="Nome da equipe">
              <Input
                name="name"
                defaultValue={editing?.name}
                required
                minLength={2}
                maxLength={120}
              />
            </Field>
            <Field helpKey="team.manager" label="Gestor">
              <Select
                name="managerId"
                defaultValue={editing?.manager?.id ?? ''}
              >
                <option value="">Sem gestor</option>
                {users
                  .filter(
                    (user) =>
                      user.ativo &&
                      ['GESTOR', 'ADMIN', 'SUPER_ADMIN'].includes(user.role),
                  )
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.nome}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field helpKey="common.description" label="Descrição">
              <Input
                name="description"
                defaultValue={editing?.description ?? ''}
                maxLength={1000}
              />
            </Field>
            <Field helpKey="team.status" label="Status da equipe">
              <Select
                name="active"
                defaultValue={String(editing?.active ?? true)}
              >
                <option value="true">Ativa</option>
                <option value="false">Inativa</option>
              </Select>
            </Field>
            <div className="flex gap-3">
              <Button type="submit" loading={pending}>
                Salvar equipe
              </Button>
              {editing && (
                <Button variant="outline" onClick={() => setEditing(null)}>
                  Cancelar edição
                </Button>
              )}
            </div>
          </form>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {teams.map((team) => (
          <Card className="space-y-3 p-6" key={team.id}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">{team.name}</h2>
              <span className="text-xs">
                {team.active ? 'Ativa' : 'Inativa'}
              </span>
            </div>
            <p className="text-sm">
              Gestor: {team.manager?.nome ?? 'Não definido'}
            </p>
            {team.description && (
              <p className="text-sm text-[var(--color-muted)]">
                {team.description}
              </p>
            )}
            <p className="text-sm font-medium">{team.members.length} membros</p>
            <ul className="space-y-2 text-sm">
              {team.members.map((member) => (
                <li key={member.id} className="flex justify-between gap-3">
                  <span>{member.nome}</span>
                  <span className="text-[var(--color-muted)]">
                    {member.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </li>
              ))}
            </ul>
            {identity.permissions.includes('teams.update') && (
              <Button variant="outline" onClick={() => setEditing(team)}>
                Editar equipe
              </Button>
            )}
          </Card>
        ))}
      </div>
      {!teams.length && <Card className="p-6">Nenhuma equipe disponível.</Card>}
      {identity.permissions.includes('teams.assign') && (
        <p className="text-sm text-[var(--color-muted)]">
          Para incluir ou transferir um membro, abra o usuário e altere sua
          equipe. O gestor recebe acesso às equipes ativas que gerencia.
        </p>
      )}
    </div>
  );
}
