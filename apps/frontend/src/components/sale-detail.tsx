'use client';

import {
  saleTransitions,
  type AuthResponse,
  type SaleDetail,
} from '@larcarvalho/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { AiAnalyzeButton } from './ai-analyze-button';
import { Alert } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Field, Input, Select } from './ui/field';

const statusLabels: Record<string, string> = {
  RASCUNHO: 'Rascunho',
  AGUARDANDO_DOCUMENTOS: 'Aguardando documentos',
  DOCUMENTOS_RECEBIDOS: 'Documentos recebidos',
  ENVIADA_ADMINISTRADORA: 'Enviada à administradora',
  EM_ANALISE: 'Em análise',
  APROVADA: 'Aprovada',
  CONTRATADA: 'Contratada',
  RECUSADA: 'Recusada',
  CANCELADA: 'Cancelada',
};
const docLabels: Record<string, string> = {
  CPF: 'CPF',
  RG_CNH: 'RG/CNH',
  COMPROVANTE_RESIDENCIA: 'Comprovante de residência',
  COMPROVANTE_RENDA: 'Comprovante de renda',
  FICHA_CADASTRAL: 'Ficha cadastral',
  CONTRATO_ASSINADO: 'Contrato assinado',
  OUTRO: 'Outro',
};
const money = (value: string | null | undefined) =>
  !value ? 'Não informado' : `R$ ${value}`;
const date = (value: string | null | undefined) =>
  !value ? 'Não informado' : new Date(value).toLocaleString('pt-BR');

async function call(path: string, method: string, body?: unknown) {
  const response = await fetch(path, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { 'content-type': 'application/json' },
    method,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(payload?.error?.message ?? 'Operação não concluída');
  }
  return response.status === 204 ? null : ((await response.json()) as unknown);
}

export function SaleDetail({
  identity,
  sale,
}: {
  readonly identity: AuthResponse;
  readonly sale: SaleDetail;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const can = (permission: string) =>
    (identity.permissions as readonly string[]).includes(permission);
  const run = async (label: string, work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await work();
      setNotice(label);
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Falha inesperada');
    } finally {
      setBusy(false);
    }
  };
  const nextStatuses = saleTransitions[sale.status] ?? [];
  const snapshot = sale.snapshot as Record<string, unknown>;
  const snap = (key: string) => {
    const value = snapshot[key];
    return typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : 'Não informado';
  };
  return (
    <div className="space-y-6">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <Card className="space-y-2 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Resumo</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              tone={
                sale.status === 'CONTRATADA'
                  ? 'success'
                  : sale.status === 'CANCELADA' || sale.status === 'RECUSADA'
                    ? 'danger'
                    : 'info'
              }
            >
              {statusLabels[sale.status] ?? sale.status}
            </Badge>
            {can('ai.sales_summary') ? (
              <AiAnalyzeButton
                contextId={sale.id}
                contextType="SALE"
                label="Resumir venda"
                message="Resuma esta venda"
                promptId="sale-summary"
              />
            ) : null}
          </div>
        </div>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--color-muted)]">Número</dt>
            <dd className="font-mono">{sale.numero}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--color-muted)]">Cliente</dt>
            <dd>
              <Link
                className="underline"
                href={`/dashboard/clientes/${sale.leadId}`}
              >
                {sale.lead?.nome ?? 'Cliente'}
              </Link>
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--color-muted)]">Origem</dt>
            <dd>
              {sale.origemVenda}
              {sale.canalVenda ? ` · ${sale.canalVenda}` : ''}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--color-muted)]">Responsável</dt>
            <dd>{sale.responsavel?.nome ?? 'Sem responsável'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--color-muted)]">Crédito contratado</dt>
            <dd className="font-semibold">
              {money(sale.valorCreditoContratado)}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--color-muted)]">Parcela contratada</dt>
            <dd>{money(sale.valorParcelaContratada)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--color-muted)]">Proposta de origem</dt>
            <dd className="font-mono">
              {sale.proposalNumero ?? sale.proposalId.slice(0, 8)}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--color-muted)]">Aceite</dt>
            <dd>{date(sale.dataAceite)}</dd>
          </div>
        </dl>
      </Card>

      <Card className="space-y-2 p-5">
        <h3 className="font-semibold">
          Produto contratado (snapshot imutável)
        </h3>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--color-muted)]">Administradora</dt>
            <dd>{snap('administradoraNome')}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--color-muted)]">Produto</dt>
            <dd>{snap('produtoNome')}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--color-muted)]">Plano</dt>
            <dd>{snap('plano')}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--color-muted)]">Prazo</dt>
            <dd>{snap('prazoMeses')} meses</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--color-muted)]">Taxa de administração</dt>
            <dd>{snap('taxaAdministracao')}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--color-muted)]">Fundo de reserva</dt>
            <dd>{snap('fundoReserva')}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--color-muted)]">Seguro</dt>
            <dd>{snap('seguro')}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--color-muted)]">Lance</dt>
            <dd>{snap('lance')}</dd>
          </div>
        </dl>
        <p className="text-xs text-[var(--color-muted)]">
          Valores congelados da proposta; consultas futuras à tabela comercial
          não os alteram.
        </p>
      </Card>

      {can('sales.change_status') && nextStatuses.length > 0 ? (
        <Card className="space-y-3 p-5">
          <h3 className="font-semibold">Avançar etapa</h3>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void run('Etapa atualizada.', () =>
                call(`/api/sales/${sale.id}/status`, 'POST', {
                  status: data.get('status'),
                  expectedUpdatedAt: sale.updatedAt,
                }),
              );
            }}
          >
            <Field helpKey="sale.status" label="Próxima etapa">
              <Select name="status" required defaultValue={nextStatuses[0]}>
                {nextStatuses.map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status] ?? status}
                  </option>
                ))}
              </Select>
            </Field>
            <Button loading={busy} type="submit">
              Confirmar etapa
            </Button>
          </form>
        </Card>
      ) : null}

      <Card className="space-y-2 p-5">
        <h3 className="font-semibold">
          Documentação (checklist, sem upload nesta fase)
        </h3>
        <ul className="divide-y divide-[var(--color-border)]">
          {sale.documents.map((doc) => (
            <li
              className="flex flex-wrap items-center justify-between gap-2 py-2"
              key={doc.id}
            >
              <div className="text-sm">
                <span className="font-medium">
                  {docLabels[doc.tipo] ?? doc.tipo}
                </span>
                {doc.obrigatorio ? (
                  <span className="text-[var(--color-danger)]"> *</span>
                ) : null}
                <span className="ml-2 text-xs text-[var(--color-muted)]">
                  {doc.status}
                </span>
                {doc.referencia ? (
                  <span className="ml-2 max-w-64 truncate text-xs">
                    ref: {doc.referencia}
                  </span>
                ) : null}
              </div>
              {can('sales.update_own') ||
              can('sales.update_team') ||
              can('sales.update_all') ? (
                <form
                  className="flex items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    void run('Documento atualizado.', () =>
                      call(
                        `/api/sales/${sale.id}/documents/${doc.id}`,
                        'PATCH',
                        {
                          status: data.get('docStatus'),
                          referencia: data.get('referencia') || null,
                          expectedUpdatedAt: doc.updatedAt,
                        },
                      ),
                    );
                  }}
                >
                  <Select
                    name="docStatus"
                    defaultValue={doc.status}
                    aria-label={`Status de ${doc.tipo}`}
                  >
                    {[
                      'PENDENTE',
                      'RECEBIDO',
                      'VALIDADO',
                      'REJEITADO',
                      'DISPENSADO',
                    ].map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </Select>
                  <Input
                    name="referencia"
                    placeholder="Referência"
                    defaultValue={doc.referencia ?? ''}
                    className="max-w-40"
                  />
                  <Button type="submit" variant="outline" loading={busy}>
                    Salvar
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-3 p-5">
        <h3 className="font-semibold">Contrato</h3>
        {sale.contracts.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">
            Nenhum contrato registrado. Contrato só existe com informação real:
            sem número fictício.
          </p>
        ) : (
          <ul className="space-y-2">
            {sale.contracts.map((contract) => (
              <li
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
                key={contract.id}
              >
                <span>
                  <span className="font-mono">
                    {contract.numeroContrato ?? contract.id.slice(0, 8)}
                  </span>
                  {' · '}
                  {contract.statusContrato}
                  {contract.numeroCota ? ` · cota ${contract.numeroCota}` : ''}
                  {contract.grupoCodigo
                    ? ` · grupo ${contract.grupoCodigo}`
                    : ''}
                </span>
                {can('contracts.update') &&
                contract.statusContrato !== 'ATIVO' &&
                contract.statusContrato !== 'CANCELADO' ? (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      void run('Contrato atualizado.', () =>
                        call(`/api/contracts/${contract.id}`, 'PATCH', {
                          statusContrato: data.get('statusContrato'),
                          numeroContrato: data.get('numeroContrato') || null,
                          numeroCota: data.get('numeroCota') || null,
                          grupoCodigo: data.get('grupoCodigo') || null,
                          expectedUpdatedAt: contract.updatedAt,
                        }),
                      );
                    }}
                  >
                    <Input
                      name="numeroContrato"
                      placeholder="Nº contrato"
                      defaultValue={contract.numeroContrato ?? ''}
                      className="max-w-36"
                    />
                    <Input
                      name="numeroCota"
                      placeholder="Cota"
                      defaultValue={contract.numeroCota ?? ''}
                      className="max-w-24"
                    />
                    <Input
                      name="grupoCodigo"
                      placeholder="Grupo"
                      defaultValue={contract.grupoCodigo ?? ''}
                      className="max-w-24"
                    />
                    <Select
                      name="statusContrato"
                      defaultValue={contract.statusContrato}
                      aria-label="Status do contrato"
                    >
                      {[
                        'RASCUNHO',
                        'EMITIDO',
                        'ASSINADO',
                        'ATIVO',
                        'CANCELADO',
                      ].map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </Select>
                    <Button type="submit" variant="outline" loading={busy}>
                      Salvar
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {can('contracts.create') &&
        !sale.contracts.some((c) => c.statusContrato !== 'CANCELADO') ? (
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void run('Contrato registrado.', () =>
                call(`/api/sales/${sale.id}/contracts`, 'POST', {
                  numeroContrato: data.get('numeroContrato') || null,
                  numeroPropostaAdministradora:
                    data.get('numeroPropostaAdministradora') || null,
                  numeroCota: data.get('numeroCota') || null,
                  grupoCodigo: data.get('grupoCodigo') || null,
                }),
              );
            }}
          >
            <Field
              helpKey="contract.status"
              label="Número do contrato (se já emitido)"
            >
              <Input name="numeroContrato" maxLength={100} />
            </Field>
            <Field label="Proposta na administradora">
              <Input name="numeroPropostaAdministradora" maxLength={100} />
            </Field>
            <Field label="Cota">
              <Input name="numeroCota" maxLength={50} />
            </Field>
            <Field label="Grupo">
              <Input name="grupoCodigo" maxLength={100} />
            </Field>
            <Button loading={busy} type="submit" className="sm:col-span-2">
              Registrar contrato
            </Button>
          </form>
        ) : null}
      </Card>

      <Card className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Comissões</h3>
          {!sale.commissionsHidden ? null : (
            <span className="text-xs text-[var(--color-muted)]">
              Sem permissão financeira
            </span>
          )}
        </div>
        {sale.commissionsHidden ? (
          <p className="text-sm text-[var(--color-muted)]">
            Valores de comissão ocultos para o seu perfil.
          </p>
        ) : sale.commissions.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">
            Nenhuma comissão lançada.
          </p>
        ) : (
          <ul className="space-y-3">
            {sale.commissions.map((commission) => (
              <li
                className="rounded-lg border border-[var(--color-border)] p-3 text-sm"
                key={commission.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {commission.tipo} · {commission.status}
                  </span>
                  <span className="text-xs text-[var(--color-muted)]">
                    comp. {commission.competencia}
                  </span>
                </div>
                <dl className="mt-2 grid gap-1 sm:grid-cols-2">
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--color-muted)]">Previsto</dt>
                    <dd className="font-semibold">
                      R$ {commission.valorPrevisto}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--color-muted)]">Confirmado</dt>
                    <dd>
                      {commission.valorConfirmado
                        ? `R$ ${commission.valorConfirmado}`
                        : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--color-muted)]">Recebido</dt>
                    <dd>R$ {commission.valorRecebido}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--color-muted)]">Base</dt>
                    <dd>
                      {commission.baseCalculo} de R$ {commission.baseValor}
                      {commission.percentual
                        ? ` (${commission.percentual}%)`
                        : ''}
                    </dd>
                  </div>
                </dl>
                {commission.valorConfirmado &&
                commission.valorConfirmado !== commission.valorPrevisto ? (
                  <p className="mt-1 text-xs font-semibold text-amber-700">
                    Divergência: previsto R$ {commission.valorPrevisto} ×
                    confirmado R$ {commission.valorConfirmado}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {can('commissions.confirm') &&
                  commission.status === 'PREVISTA' ? (
                    <form
                      className="flex items-center gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        void run('Comissão confirmada.', () =>
                          call(
                            `/api/commissions/${commission.id}/confirm`,
                            'POST',
                            {
                              valorConfirmado: data.get('valorConfirmado'),
                              expectedUpdatedAt: commission.updatedAt,
                            },
                          ),
                        );
                      }}
                    >
                      <Input
                        name="valorConfirmado"
                        placeholder="Valor confirmado"
                        required
                        className="max-w-36"
                        inputMode="decimal"
                      />
                      <Button type="submit" variant="outline" loading={busy}>
                        Confirmar
                      </Button>
                    </form>
                  ) : null}
                  {can('commissions.receive') &&
                  (commission.status === 'CONFIRMADA' ||
                    commission.status === 'PARCIALMENTE_RECEBIDA') ? (
                    <form
                      className="flex items-center gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        void run('Recebimento registrado.', () =>
                          call(
                            `/api/commissions/${commission.id}/receive`,
                            'POST',
                            {
                              valorRecebido: data.get('valorRecebido'),
                              referenciaExterna:
                                data.get('referenciaExterna') || null,
                              observacoes: data.get('observacoes') || undefined,
                              expectedUpdatedAt: commission.updatedAt,
                            },
                          ),
                        );
                      }}
                    >
                      <Input
                        name="valorRecebido"
                        placeholder="Valor recebido"
                        required
                        className="max-w-36"
                        inputMode="decimal"
                      />
                      <Input
                        name="referenciaExterna"
                        placeholder="Referência"
                        className="max-w-36"
                      />
                      <Button type="submit" variant="outline" loading={busy}>
                        Receber
                      </Button>
                    </form>
                  ) : null}
                  {can('commissions.reverse') &&
                  (commission.status === 'RECEBIDA' ||
                    commission.status === 'PARCIALMENTE_RECEBIDA') &&
                  commission.tipo !== 'ESTORNO' ? (
                    <Button
                      type="button"
                      variant="outline"
                      loading={busy}
                      onClick={() =>
                        void run(
                          'Estorno registrado; histórico preservado.',
                          () =>
                            call(
                              `/api/commissions/${commission.id}/reverse`,
                              'POST',
                              {
                                motivo: 'CANCELAMENTO_VENDA',
                                expectedUpdatedAt: commission.updatedAt,
                              },
                            ),
                        )
                      }
                    >
                      Estornar
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {can('commissions.create') && !sale.commissionsHidden ? (
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void run('Comissão prevista lançada.', () =>
                call(`/api/commissions/sales/${sale.id}/commissions`, 'POST', {
                  tipo: data.get('tipo') || 'PRINCIPAL',
                  baseCalculo: data.get('baseCalculo'),
                  baseValor: data.get('baseValor'),
                  percentual: data.get('percentual') || null,
                  valorPrevisto: data.get('valorPrevisto') || undefined,
                  competencia: data.get('competencia'),
                }),
              );
            }}
          >
            <Field label="Tipo">
              <Select name="tipo" defaultValue="PRINCIPAL">
                <option value="PRINCIPAL">Principal</option>
                <option value="BONIFICACAO">Bonificação</option>
                <option value="CAMPANHA">Campanha</option>
                <option value="REPASSE">Repasse</option>
              </Select>
            </Field>
            <Field helpKey="commission.base" label="Base de cálculo" required>
              <Select name="baseCalculo" required defaultValue="CREDITO">
                <option value="CREDITO">Crédito</option>
                <option value="TAXA_ADMINISTRACAO">
                  Taxa de administração
                </option>
                <option value="PARCELA">Parcela</option>
                <option value="VALOR_FIXO">Valor fixo</option>
                <option value="OUTRA">Outra</option>
              </Select>
            </Field>
            <Field helpKey="commission.value" label="Valor da base" required>
              <Input
                name="baseValor"
                required
                inputMode="decimal"
                placeholder="150000.00"
              />
            </Field>
            <Field label="Percentual (opcional se valor)">
              <Input name="percentual" inputMode="decimal" placeholder="2.50" />
            </Field>
            <Field label="Valor previsto (opcional se percentual)">
              <Input
                name="valorPrevisto"
                inputMode="decimal"
                placeholder="3750.00"
              />
            </Field>
            <Field label="Competência (AAAA-MM)" required>
              <Input
                name="competencia"
                required
                placeholder="2026-10"
                pattern="\d{4}-\d{2}"
              />
            </Field>
            <Button loading={busy} type="submit" className="sm:col-span-2">
              Lançar comissão prevista
            </Button>
          </form>
        ) : null}
      </Card>

      <Card className="space-y-2 p-5">
        <h3 className="font-semibold">Linha do tempo</h3>
        <ol className="space-y-2 text-sm">
          {sale.statusHistory.map((entry) => (
            <li key={entry.id} className="flex flex-wrap gap-2">
              <Badge tone="neutral">
                {entry.fromStatus ?? '—'} → {entry.toStatus}
              </Badge>
              <span className="text-[var(--color-muted)]">
                {new Date(entry.createdAt).toLocaleString('pt-BR')}
              </span>
              {entry.changedBy ? <span>· {entry.changedBy.nome}</span> : null}
              {entry.reason ? (
                <span className="text-[var(--color-muted)]">
                  · {entry.reason}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </Card>

      {(can('sales.assign') || can('sales.cancel')) &&
      !['CONTRATADA', 'CANCELADA', 'RECUSADA'].includes(sale.status) ? (
        <Card className="space-y-3 p-5">
          <h3 className="font-semibold">Gestão</h3>
          {can('sales.assign') ? (
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                void run('Responsável transferido.', () =>
                  call(`/api/sales/${sale.id}/assign`, 'POST', {
                    responsavelUserId: data.get('responsavelUserId'),
                    expectedUpdatedAt: sale.updatedAt,
                  }),
                );
              }}
            >
              <Field helpKey="sale.assign" label="Novo responsável (ID)">
                <Input
                  name="responsavelUserId"
                  required
                  placeholder="UUID do usuário"
                />
              </Field>
              <Button loading={busy} type="submit" variant="outline">
                Transferir
              </Button>
            </form>
          ) : null}
          {can('sales.cancel') ? (
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                void run('Venda cancelada e preservada.', () =>
                  call(`/api/sales/${sale.id}/cancel`, 'POST', {
                    motivo: data.get('motivo'),
                    observacoes: data.get('observacoes') || undefined,
                    expectedUpdatedAt: sale.updatedAt,
                  }),
                );
              }}
            >
              <Field helpKey="sale.cancel" label="Motivo do cancelamento">
                <Select name="motivo" required defaultValue="CLIENTE_DESISTIU">
                  <option value="CLIENTE_DESISTIU">Cliente desistiu</option>
                  <option value="CREDITO_NEGADO">Crédito negado</option>
                  <option value="DOCUMENTACAO_REPROVADA">
                    Documentação reprovada
                  </option>
                  <option value="VALOR_ALTERADO">Valor alterado</option>
                  <option value="ESCOLHEU_CONCORRENTE">
                    Escolheu concorrente
                  </option>
                  <option value="OUTRO">Outro</option>
                </Select>
              </Field>
              <Field label="Observações">
                <Input name="observacoes" maxLength={2000} />
              </Field>
              <Button loading={busy} type="submit" variant="outline">
                Cancelar venda
              </Button>
            </form>
          ) : null}
        </Card>
      ) : null}

      {sale.auditTrail.length > 0 ? (
        <Card className="space-y-2 p-5">
          <h3 className="font-semibold">Auditoria resumida</h3>
          <ul className="space-y-1 text-xs text-[var(--color-muted)]">
            {sale.auditTrail.slice(0, 20).map((entry) => (
              <li key={entry.id}>
                {new Date(entry.createdAt).toLocaleString('pt-BR')} ·{' '}
                {entry.entity} · {entry.action}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
