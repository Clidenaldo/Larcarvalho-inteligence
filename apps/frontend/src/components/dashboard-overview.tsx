import type { DashboardOverview } from '@larcarvalho/shared';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleGauge,
  Database,
  RefreshCcw,
  UsersRound,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import {
  formatDateTime,
  formatNumber,
  formatPercentage,
} from '../lib/formatters';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { EmptyState } from './ui/empty-state';

type Item = { key: string; label: string; value: number };

function Section({
  title,
  description,
  href,
  children,
}: {
  title: string;
  description: string;
  href?: string;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <header className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {description}
          </p>
        </div>
        {href ? (
          <Link
            className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[var(--color-primary)]"
            href={href}
          >
            Ver módulo
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        ) : null}
      </header>
      <div className="p-5 sm:p-6">{children}</div>
    </Card>
  );
}

function Metric({
  title,
  value,
  context,
  href,
  icon,
}: {
  title: string;
  value: number | string;
  context: string;
  href?: string;
  icon: ReactNode;
}) {
  const content = (
    <>
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
        {icon}
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-tight">
        {typeof value === 'number' ? formatNumber(value) : value}
      </p>
      <p className="mt-1 text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">
        {context}
      </p>
    </>
  );
  return (
    <Card className="p-5">
      {href ? (
        <Link className="block" href={href}>
          {content}
        </Link>
      ) : (
        content
      )}
    </Card>
  );
}

function Comparison({
  value,
}: {
  value: { current: number; previous: number; changePercent: number | null };
}) {
  return (
    <span className="text-xs text-[var(--color-muted)]">
      {value.changePercent === null
        ? 'Sem base anterior'
        : `${value.changePercent >= 0 ? '+' : ''}${formatPercentage(value.changePercent)} vs. período anterior`}
    </span>
  );
}

export function DashboardBars({
  items,
  empty = 'Sem dados para distribuir.',
}: {
  items: Item[];
  empty?: string;
}) {
  if (!items.length || items.every((item) => item.value === 0))
    return <EmptyState title="Sem dados" description={empty} />;
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <div>
      <div aria-hidden="true" className="space-y-3">
        {items.map((item) => (
          <div key={item.key}>
            <div className="mb-1 flex justify-between gap-3 text-sm">
              <span>{item.label}</span>
              <strong>{formatNumber(item.value)}</strong>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[var(--color-primary)]"
                style={{ width: `${Math.max(3, (item.value / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <details className="mt-4 text-sm">
        <summary className="font-semibold text-[var(--color-primary)]">
          Ver dados em tabela
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="py-2">Categoria</th>
                <th className="py-2 text-right">Quantidade</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  className="border-t border-[var(--color-border)]"
                  key={item.key}
                >
                  <td className="py-2">{item.label}</td>
                  <td className="py-2 text-right">
                    {formatNumber(item.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function Crm({
  data,
  period,
}: {
  data: NonNullable<DashboardOverview['crm']>;
  period: DashboardOverview['period'];
}) {
  return (
    <Section
      title={data.scope === 'OWN' ? 'Minha carteira' : 'Comercial / CRM'}
      description="Estoque atual e fluxos do período, sem pontuação de vendedores."
      href="/dashboard/crm"
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          title="Ativos agora"
          value={data.activeNow}
          context="Exclui CONVERTIDO e PERDIDO."
          icon={<UsersRound className="h-5 w-5" />}
        />
        <Metric
          title="Novos"
          value={data.newInPeriod.current}
          context={period.label}
          icon={<CircleGauge className="h-5 w-5" />}
        />
        <Metric
          title="Convertidos"
          value={data.convertedInPeriod.current}
          context={period.label}
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <Metric
          title="Contatos atrasados"
          value={data.contacts.overdue}
          context="Lead ativo, horário anterior a agora."
          icon={<CalendarClock className="h-5 w-5" />}
        />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-[var(--color-surface-subtle)] p-4">
          <p className="font-semibold">Novos</p>
          <Comparison value={data.newInPeriod} />
        </div>
        <div className="rounded-xl bg-[var(--color-surface-subtle)] p-4">
          <p className="font-semibold">Convertidos</p>
          <Comparison value={data.convertedInPeriod} />
        </div>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div>
          <h3 className="mb-3 font-semibold">Funil atual</h3>
          <DashboardBars items={data.funnel} />
        </div>
        <div>
          <h3 className="mb-3 font-semibold">Origens no período</h3>
          <DashboardBars items={data.origins} />
        </div>
        <div>
          <h3 className="mb-3 font-semibold">Categorias no período</h3>
          <DashboardBars items={data.categories} />
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <strong>{data.contacts.today}</strong>
          <p className="text-xs text-[var(--color-muted)]">Contatos hoje</p>
        </div>
        <div>
          <strong>{data.contacts.upcoming}</strong>
          <p className="text-xs text-[var(--color-muted)]">Próximos</p>
        </div>
        <div>
          <strong>{data.contacts.withoutNextContact}</strong>
          <p className="text-xs text-[var(--color-muted)]">
            Sem próximo contato
          </p>
        </div>
        <div>
          <strong>{data.lostNow}</strong>
          <p className="text-xs text-[var(--color-muted)]">Perdidos agora</p>
        </div>
      </div>
      {data.team.length ? (
        <div className="mt-7 overflow-x-auto">
          <h3 className="mb-3 font-semibold">Visão factual da equipe</h3>
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr>
                {[
                  'Responsável',
                  'Atribuídos',
                  'Ativos',
                  'Contatos',
                  'Convertidos',
                  'Perdidos',
                  'Atrasados',
                ].map((item) => (
                  <th className="border-b p-3" key={item}>
                    {item}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.team.map((row) => (
                <tr key={row.responsibleId}>
                  {[
                    row.responsible,
                    row.assigned,
                    row.active,
                    row.contactsPerformed,
                    row.converted,
                    row.lost,
                    row.overdue,
                  ].map((value, index) => (
                    <td className="border-b p-3" key={index}>
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Section>
  );
}

export function DashboardOverviewView({
  data,
}: {
  readonly data: DashboardOverview;
}) {
  const main = [
    data.crm && {
      title: data.crm.scope === 'OWN' ? 'Meus leads ativos' : 'Leads ativos',
      value: data.crm.activeNow,
      context: 'Estado atual; exclui convertidos e perdidos.',
      href: '/dashboard/crm',
      icon: <UsersRound className="h-5 w-5" />,
    },
    data.crm && {
      title: 'Novos no período',
      value: data.crm.newInPeriod.current,
      context: data.period.label,
      href: '/dashboard/crm',
      icon: <CircleGauge className="h-5 w-5" />,
    },
    data.consorcios && {
      title: 'Grupos ativos',
      value: data.consorcios.totals.gruposAtivos,
      context: 'Estado atual da base.',
      href: '/dashboard/grupos',
      icon: <Database className="h-5 w-5" />,
    },
    data.quality && {
      title: 'Issues abertas',
      value:
        data.quality.statuses.find((item) => item.key === 'OPEN')?.value ?? 0,
      context: 'Estado atual de qualidade.',
      href: '/dashboard/qualidade-dados',
      icon: <AlertTriangle className="h-5 w-5" />,
    },
    data.integrations && {
      title: 'Integrações em erro',
      value:
        data.integrations.statuses.find((item) => item.key === 'ERRO')?.value ??
        0,
      context: 'Estado operacional atual.',
      href: '/dashboard/integracoes',
      icon: <RefreshCcw className="h-5 w-5" />,
    },
  ].filter(Boolean) as Array<{
    title: string;
    value: number;
    context: string;
    href: string;
    icon: ReactNode;
  }>;
  return (
    <div className="space-y-6">
      <section
        aria-label="Indicadores principais"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
      >
        {main.map((item) => (
          <Metric key={item.title} {...item} />
        ))}
      </section>
      <Section
        title="Requer atenção"
        description="Pendências objetivas ordenadas por impacto operacional."
      >
        {data.attention.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {data.attention.map((item) => (
              <Link
                className="flex items-start justify-between gap-4 rounded-xl border border-[var(--color-border)] p-4 hover:bg-slate-50"
                href={item.href}
                key={item.id}
              >
                <div>
                  <Badge
                    tone={
                      item.severity === 'CRITICO'
                        ? 'danger'
                        : item.severity === 'ALTO'
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {item.severity}
                  </Badge>
                  <p className="mt-2 font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm text-[var(--color-muted)]">
                    {item.detail}
                  </p>
                </div>
                <strong className="text-xl">{item.value}</strong>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nenhuma pendência objetiva"
            description="Não há alertas calculáveis para os módulos autorizados."
          />
        )}
      </Section>
      {data.crm ? <Crm data={data.crm} period={data.period} /> : null}
      {data.consorcios ? (
        <Section
          title="Base de consórcios"
          description="Contagens factuais do estado atual da base."
          href="/dashboard/grupos"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {Object.entries(data.consorcios.totals).map(([key, value]) => (
              <div
                className="rounded-xl bg-[var(--color-surface-subtle)] p-4"
                key={key}
              >
                <strong className="text-xl">{formatNumber(value)}</strong>
                <p className="mt-1 text-xs capitalize text-[var(--color-muted)]">
                  {key.replace(/([A-Z])/g, ' $1')}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-7 grid gap-7 xl:grid-cols-3">
            <div>
              <h3 className="mb-3 font-semibold">Grupos por categoria</h3>
              <DashboardBars items={data.consorcios.categories} />
            </div>
            <div>
              <h3 className="mb-3 font-semibold">
                Por administradora (Top 5 + outras)
              </h3>
              <DashboardBars items={data.consorcios.administrators} />
            </div>
            <div>
              <h3 className="mb-3 font-semibold">Faixa de crédito mínima</h3>
              <DashboardBars items={data.consorcios.creditBands} />
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Metric
              title="Snapshots"
              value={data.consorcios.snapshots.total}
              context="Registros históricos reais."
              icon={<Database className="h-5 w-5" />}
            />
            <Metric
              title="Cobertura de lances"
              value={
                data.consorcios.snapshots.averageBidCoverage === null
                  ? 'Sem dados'
                  : formatPercentage(
                      data.consorcios.snapshots.averageBidCoverage,
                    )
              }
              context="Média dos snapshots mais recentes."
              icon={<CircleGauge className="h-5 w-5" />}
            />
            <Metric
              title="Cobertura de contemplações"
              value={
                data.consorcios.snapshots.averageAwardCoverage === null
                  ? 'Sem dados'
                  : formatPercentage(
                      data.consorcios.snapshots.averageAwardCoverage,
                    )
              }
              context="Média dos snapshots mais recentes."
              icon={<CircleGauge className="h-5 w-5" />}
            />
          </div>
        </Section>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-2">
        {data.quality ? (
          <Section
            title="Qualidade dos dados"
            description="Estado atual, severidades abertas e resoluções no período."
            href="/dashboard/qualidade-dados"
          >
            <DashboardBars items={data.quality.statuses} />
            <h3 className="mb-3 mt-6 font-semibold">
              Severidade das pendências
            </h3>
            <DashboardBars items={data.quality.severities} />
            <p className="mt-5 text-sm">
              <strong>{data.quality.resolvedInPeriod.current}</strong>{' '}
              resolvidas em {data.period.label.toLowerCase()}.{' '}
              <Comparison value={data.quality.resolvedInPeriod} />
            </p>
          </Section>
        ) : null}
        {data.imports ? (
          <Section
            title="Importações"
            description={`Fluxo operacional em ${data.period.label.toLowerCase()}.`}
            href="/dashboard/importacoes"
          >
            <DashboardBars items={data.imports.statuses} />
            <div className="mt-5 flex gap-8 text-sm">
              <p>
                <strong>{formatNumber(data.imports.processedRecords)}</strong>
                <br />
                registros processados
              </p>
              <p>
                <strong>{formatNumber(data.imports.generatedIssues)}</strong>
                <br />
                issues geradas
              </p>
            </div>
          </Section>
        ) : null}
      </div>
      {data.integrations ? (
        <Section
          title="Integrações"
          description={`Estado atual e execuções em ${data.period.label.toLowerCase()}.`}
          href="/dashboard/integracoes"
        >
          <div className="grid gap-7 xl:grid-cols-2">
            <div>
              <h3 className="mb-3 font-semibold">Estado atual</h3>
              <DashboardBars items={data.integrations.statuses} />
            </div>
            <div>
              <h3 className="mb-3 font-semibold">Execuções no período</h3>
              <DashboardBars items={data.integrations.runs} />
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Metric
              title="Taxa de sucesso"
              value={
                data.integrations.successRate === null
                  ? 'Sem execuções'
                  : formatPercentage(data.integrations.successRate)
              }
              context="Sucesso / runs elegíveis concluídas."
              icon={<CheckCircle2 className="h-5 w-5" />}
            />
            <Metric
              title="Duração média"
              value={
                data.integrations.averageDurationMs === null
                  ? 'Sem dados'
                  : `${formatNumber(data.integrations.averageDurationMs)} ms`
              }
              context="Runs finalizadas elegíveis."
              icon={<RefreshCcw className="h-5 w-5" />}
            />
            <Metric
              title="Registros recebidos"
              value={data.integrations.processedRecords}
              context={data.period.label}
              icon={<Database className="h-5 w-5" />}
            />
          </div>
        </Section>
      ) : null}
      <Section
        title="Atividade recente"
        description="Feed curto, sem telefone, e-mail, payload ou segredo."
      >
        {data.activity.length ? (
          <ol className="divide-y divide-[var(--color-border)]">
            {data.activity.map((item) => (
              <li key={item.id}>
                <Link
                  className="flex items-center justify-between gap-4 py-3"
                  href={item.href}
                >
                  <div>
                    <p className="font-semibold">{item.label}</p>
                    <p className="text-sm text-[var(--color-muted)]">
                      {item.detail}
                    </p>
                  </div>
                  <time
                    className="shrink-0 text-xs text-[var(--color-muted)]"
                    dateTime={item.occurredAt}
                  >
                    {formatDateTime(item.occurredAt)}
                  </time>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState
            title="Sem atividade recente"
            description="Nenhum evento autorizado está disponível."
          />
        )}
      </Section>
      <p className="text-right text-xs text-[var(--color-muted)]">
        Atualizado em {formatDateTime(data.generatedAt)} ·{' '}
        {data.period.timezone}
      </p>
    </div>
  );
}
