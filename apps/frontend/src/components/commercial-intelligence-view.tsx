import type { CommercialIntelligence } from '@larcarvalho/shared';
import { AlertTriangle, ArrowRight, Banknote, CheckCircle2, Clock3, FileText, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { EmptyState } from './ui/empty-state';

const number = new Intl.NumberFormat('pt-BR');
const currency = (value: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value as unknown as number);
const percent = (value: number | null) => value === null ? 'Sem base' : new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 }).format(value);

function Metric({ label, value, detail, href, icon }: { label: string; value: string | number; detail: string; href: string; icon: React.ReactNode }) {
  return <Link href={href}><Card className="h-full p-4 transition hover:border-[var(--color-primary)]">
    <div className="flex items-start justify-between gap-3"><span className="text-[var(--color-primary)]">{icon}</span><ArrowRight className="h-4 w-4 text-[var(--color-muted)]" /></div>
    <p className="mt-3 text-2xl font-semibold">{typeof value === 'number' ? number.format(value) : value}</p>
    <p className="mt-1 text-sm font-semibold">{label}</p><p className="mt-1 text-xs text-[var(--color-muted)]">{detail}</p>
  </Card></Link>;
}

export function CommercialIntelligenceView({ data }: { data: CommercialIntelligence }) {
  const metrics = [
    ['Clientes ativos', data.summary.activeClients, 'Estado atual', '/dashboard/carteira', <UsersRound className="h-5 w-5" />],
    ['Follow-ups atrasados', data.summary.overdueFollowUps, 'Vencidos agora', '/dashboard/agenda', <Clock3 className="h-5 w-5" />],
    ['Propostas geradas', data.summary.proposals.current, data.period.label, '/propostas', <FileText className="h-5 w-5" />],
    ['Propostas aceitas', data.summary.acceptedProposals.current, data.period.label, '/propostas?status=ACCEPTED', <CheckCircle2 className="h-5 w-5" />],
    ['Vendas abertas', data.summary.openSales, 'Estado atual', '/dashboard/vendas', <Banknote className="h-5 w-5" />],
    ['Contratos pendentes', data.summary.pendingContracts, 'Rascunhos e emitidos', '/dashboard/vendas', <AlertTriangle className="h-5 w-5" />],
  ] as const;
  return <div className="space-y-6">
    <section aria-label="Resumo executivo" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">{metrics.map(([label, value, detail, href, icon]) => <Metric key={label} label={label} value={value} detail={detail} href={href} icon={icon} />)}</section>
    {data.financial ? <section><h2 className="mb-3 text-lg font-semibold">Comissoes</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[['Prevista', data.financial.expected], ['Confirmada', data.financial.confirmed], ['Recebida', data.financial.received], ['Saldo confirmado', data.financial.confirmedReceivable]].map(([label, value]) => <Card className="p-4" key={label}><p className="text-xs text-[var(--color-muted)]">{label}</p><p className="mt-2 text-xl font-semibold">{currency(value!)}</p></Card>)}
    </div></section> : null}
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <section><h2 className="mb-3 text-lg font-semibold">Pipeline factual</h2><Card className="overflow-hidden"><div className="divide-y divide-[var(--color-border)]">{data.pipeline.map((stage, index) => <Link className="flex items-center gap-4 p-4 hover:bg-[var(--color-surface-subtle)]" href={stage.href} key={stage.key}><span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--color-primary-soft)] text-sm font-bold text-[var(--color-primary)]">{index + 1}</span><span className="flex-1 font-medium">{stage.label}</span><strong>{number.format(stage.count)}</strong></Link>)}</div></Card>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{data.conversions.map((item) => <Card className="p-4" key={item.key}><p className="font-semibold">{item.label}</p><p className="mt-2 text-xl">{percent(item.rate)}</p><p className="text-xs text-[var(--color-muted)]">{item.numerator} de {item.denominator}</p></Card>)}</div></section>
      <section><h2 className="mb-3 text-lg font-semibold">Atencao necessaria</h2>{data.attention.length ? <div className="space-y-3">{data.attention.map((item) => <Link href={item.href} key={item.type}><Card className="mb-3 p-4"><div className="flex justify-between gap-3"><Badge tone={item.severity === 'HIGH' ? 'danger' : item.severity === 'MEDIUM' ? 'warning' : 'neutral'}>{item.type.replaceAll('_', ' ')}</Badge><strong>{item.count}</strong></div><p className="mt-2 text-sm text-[var(--color-muted)]">{item.reason}</p></Card></Link>)}</div> : <Card><EmptyState title="Sem pendencias" description="Nenhum alerta deterministico no escopo atual." /></Card>}</section>
    </div>
    {data.performance.length > 1 ? <section><h2 className="mb-3 text-lg font-semibold">Performance factual</h2><Card className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead><tr>{['Vendedor', 'Clientes', 'Follow-ups atrasados', 'Simulacoes', 'Propostas', 'Aceitas', 'Vendas', 'Contratos'].map(x => <th className="border-b p-3" key={x}>{x}</th>)}</tr></thead><tbody>{data.performance.map(row => <tr key={row.sellerId}>{[row.seller, row.activeClients, row.overdueFollowUps, row.simulations, row.proposals, row.acceptedProposals, row.sales, row.contracts].map((x, i) => <td className="border-b p-3" key={i}>{x}</td>)}</tr>)}</tbody></table></Card></section> : null}
    <p className="text-right text-xs text-[var(--color-muted)]">Fontes: {data.sources.join(', ')}. Atualizado em {new Date(data.generatedAt).toLocaleString('pt-BR')}.</p>
  </div>;
}
