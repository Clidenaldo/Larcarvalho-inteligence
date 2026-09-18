'use client';
import { HelpLabel } from './ui/field-help';

import {
  leadInteractionTypes,
  leadLossReasons,
  leadStatuses,
  type LeadDetail,
  type ManagedUser,
  type Permission,
} from '@larcarvalho/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Field, Input, Select } from './ui/field';

interface GroupOption {
  id: string;
  codigo: string;
}
export function LeadDetailManager({
  lead,
  permissions,
  users,
  groups,
}: {
  lead: LeadDetail;
  permissions: Permission[];
  users: ManagedUser[];
  groups: GroupOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canAssign = permissions.includes('leads.assign');
  const canUpdate =
    permissions.includes('leads.update_all') ||
    permissions.includes('leads.update_team') ||
    permissions.includes('leads.update_own');
  async function mutate(
    path: string,
    method: 'POST' | 'PATCH' | 'DELETE',
    body?: unknown,
  ) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/leads/${lead.id}${path}`, {
        method,
        ...(body
          ? {
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            }
          : {}),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message ?? 'Não foi possível salvar');
      }
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Não foi possível salvar',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      {error ? (
        <p
          className="rounded-xl bg-red-50 p-4 text-sm text-[var(--color-danger)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">Dados e contato</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[var(--color-muted)]">Telefone</dt>
              <dd>
                {lead.telefone ? (
                  <a
                    className="font-semibold text-[var(--color-primary)]"
                    href={`https://wa.me/${lead.telefone}`}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {lead.telefone} · abrir WhatsApp
                  </a>
                ) : (
                  'Não informado'
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">E-mail</dt>
              <dd>
                {lead.email ? (
                  <a
                    className="font-semibold text-[var(--color-primary)]"
                    href={`mailto:${lead.email}`}
                  >
                    {lead.email}
                  </a>
                ) : (
                  'Não informado'
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Origem</dt>
              <dd>{lead.origem.replaceAll('_', ' ')}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Responsável</dt>
              <dd>{lead.responsavel?.nome ?? 'Não atribuído'}</dd>
            </div>
          </dl>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Perfil comercial</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[var(--color-muted)]">Categoria</dt>
              <dd>{lead.categoriaInteresse ?? 'Não informada'}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Crédito</dt>
              <dd>{lead.valorCreditoDesejado ?? 'Não informado'}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Parcela máxima</dt>
              <dd>{lead.parcelaMaxima ?? 'Não informada'}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Prazo</dt>
              <dd>
                {lead.prazoMinimo ?? '—'} a {lead.prazoMaximo ?? '—'} meses
              </dd>
            </div>
          </dl>
        </Card>
      </div>
      {canUpdate ? (
        <section className="grid gap-5 lg:grid-cols-3">
          <Card className="p-5">
            <form
              action={(data) =>
                void mutate('/status', 'POST', {
                  status: data.get('status'),
                  motivoPerda: data.get('motivoPerda') || undefined,
                  descricaoMotivoPerda:
                    data.get('descricaoMotivoPerda') || undefined,
                  observacao: data.get('observacao') || undefined,
                  expectedUpdatedAt: lead.updatedAt,
                })
              }
              className="space-y-3"
            >
              <h2 className="font-semibold">Alterar status</h2>
              <Field helpKey="lead.status" label="Novo status">
                <Select defaultValue="" name="status" required>
                  <option disabled value="">
                    Selecione
                  </option>
                  {leadStatuses
                    .filter((status) => status !== lead.status)
                    .map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                </Select>
              </Field>
              <Field helpKey="lead.loss" label="Motivo da perda">
                <Select defaultValue="" name="motivoPerda">
                  <option value="">Não se aplica</option>
                  {leadLossReasons.map((reason) => (
                    <option key={reason}>{reason}</option>
                  ))}
                </Select>
              </Field>
              <Field
                helpKey="lead.lossDetail"
                label="Descrição do motivo (para Outro)"
              >
                <Input maxLength={300} name="descricaoMotivoPerda" />
              </Field>
              <Field helpKey="common.notes" label="Observação da mudança">
                <Input maxLength={500} name="observacao" />
              </Field>
              <Button disabled={busy} type="submit">
                Alterar status
              </Button>
            </form>
          </Card>
          <Card className="p-5">
            <form
              action={(data) => {
                const raw = String(data.get('proximoContatoEm') ?? '');
                void mutate('/proximo-contato', 'PATCH', {
                  proximoContatoEm: raw ? new Date(raw).toISOString() : null,
                  expectedUpdatedAt: lead.updatedAt,
                });
              }}
              className="space-y-3"
            >
              <h2 className="font-semibold">Próximo contato</h2>
              <Field helpKey="lead.nextContact" label="Data e hora">
                <Input name="proximoContatoEm" type="datetime-local" />
              </Field>
              <Button disabled={busy} type="submit">
                Salvar acompanhamento
              </Button>
            </form>
          </Card>
          <Card className="p-5">
            <form
              action={(data) =>
                void mutate('/interacoes', 'POST', {
                  tipo: data.get('tipo'),
                  descricao: data.get('descricao'),
                })
              }
              className="space-y-3"
            >
              <h2 className="font-semibold">Registrar interação</h2>
              <Field helpKey="lead.interaction" label="Tipo">
                <Select name="tipo">
                  {leadInteractionTypes
                    .filter((type) => type !== 'STATUS')
                    .map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                </Select>
              </Field>
              <Field helpKey="lead.interactionText" label="Descrição">
                <textarea
                  className="min-h-28 w-full rounded-xl border border-[var(--color-border-strong)] p-3 text-sm"
                  maxLength={2000}
                  name="descricao"
                  required
                />
              </Field>
              <Button disabled={busy} type="submit">
                Adicionar à timeline
              </Button>
            </form>
          </Card>
        </section>
      ) : null}
      {canUpdate ? (
        <Card className="p-5">
          <form
            action={(data) =>
              void mutate('', 'PATCH', {
                nome: data.get('nome'),
                telefone: data.get('telefone') || null,
                email: data.get('email') || null,
                expectedUpdatedAt: lead.updatedAt,
              })
            }
            className="grid gap-3 md:grid-cols-4"
          >
            <Field helpKey="lead.name" label="Nome">
              <Input defaultValue={lead.nome} name="nome" required />
            </Field>
            <Field helpKey="lead.phone" label="Telefone">
              <Input defaultValue={lead.telefone ?? ''} name="telefone" />
            </Field>
            <Field helpKey="lead.email" label="E-mail">
              <Input
                defaultValue={lead.email ?? ''}
                name="email"
                type="email"
              />
            </Field>
            <Button className="self-end" disabled={busy} type="submit">
              Atualizar contato
            </Button>
          </form>
        </Card>
      ) : null}
      {canAssign ? (
        <Card className="p-5">
          <form
            action={(data) =>
              void mutate('/assign', 'POST', {
                responsavelId: data.get('responsavelId') || null,
                expectedUpdatedAt: lead.updatedAt,
              })
            }
            className="flex flex-wrap items-end gap-3"
          >
            <Field helpKey="lead.owner" label="Atribuir responsável">
              <Select
                defaultValue={lead.responsavel?.id ?? ''}
                name="responsavelId"
              >
                <option value="">Não atribuído</option>
                {users
                  .filter(
                    (user) =>
                      user.ativo &&
                      ['VENDEDOR', 'GESTOR', 'ADMIN', 'SUPER_ADMIN'].includes(
                        user.role,
                      ),
                  )
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.nome} · {user.role}
                    </option>
                  ))}
              </Select>
            </Field>
            <Button disabled={busy} type="submit">
              Atribuir
            </Button>
          </form>
        </Card>
      ) : null}
      {canUpdate ? (
        <Card className="p-5">
          <form
            action={(data) =>
              void mutate('/interesses', 'POST', {
                grupoId: data.get('grupoId'),
                principal: data.get('principal') === 'on',
              })
            }
            className="flex flex-wrap items-end gap-3"
          >
            <Field helpKey="lead.interest" label="Adicionar interesse">
              <Select name="grupoId" required>
                <option value="">Selecione o grupo</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    Grupo {group.codigo}
                  </option>
                ))}
              </Select>
            </Field>
            <HelpLabel
              helpKey="lead.primary"
              className="flex min-h-11 items-center gap-2 text-sm"
            >
              <input name="principal" type="checkbox" />
              Principal
            </HelpLabel>
            <Button disabled={busy} type="submit">
              Adicionar
            </Button>
          </form>
        </Card>
      ) : null}
      <Card className="p-5">
        <h2 className="font-semibold">Interesses</h2>
        {lead.interesses.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {lead.interesses.map((interest) => (
              <article
                className="rounded-xl border border-[var(--color-border)] p-4"
                key={interest.id}
              >
                <div className="flex justify-between gap-3">
                  <strong>
                    {interest.administradora} · Grupo {interest.grupo}
                  </strong>
                  {interest.principal ? (
                    <span className="text-xs font-semibold text-[var(--color-primary)]">
                      Principal
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-[var(--color-muted)]">
                  Aderência capturada:{' '}
                  {interest.indiceAderenciaCapturado ?? 'indisponível'} ·
                  cobertura{' '}
                  {interest.coberturaAvaliacaoCapturada ?? 'indisponível'}%
                </p>
                {canUpdate ? (
                  <Button
                    className="mt-3"
                    disabled={busy}
                    onClick={() =>
                      void mutate(`/interesses/${interest.id}`, 'DELETE')
                    }
                    variant="ghost"
                  >
                    Remover
                  </Button>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--color-muted)]">
            Nenhum grupo relacionado.
          </p>
        )}
      </Card>
      <Card className="p-5">
        <h2 className="font-semibold">Timeline comercial</h2>
        {lead.interacoes.length ? (
          <ol className="mt-5 space-y-4">
            {lead.interacoes.map((interaction) => (
              <li
                className="border-l-2 border-indigo-200 pl-4"
                key={interaction.id}
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <strong className="text-sm">{interaction.tipo}</strong>
                  <time className="text-xs text-[var(--color-muted)]">
                    {new Intl.DateTimeFormat('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                      timeZone: 'America/Fortaleza',
                    }).format(new Date(interaction.ocorridoEm))}
                  </time>
                </div>
                <p className="mt-1 text-sm">{interaction.descricao}</p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  {interaction.criadoPor?.nome ?? 'Sistema público'}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-sm text-[var(--color-muted)]">
            Nenhuma interação registrada.
          </p>
        )}
      </Card>
    </div>
  );
}
