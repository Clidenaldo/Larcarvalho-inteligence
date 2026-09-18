import { commercialIntelligenceQuerySchema } from '@larcarvalho/shared';
import { redirect } from 'next/navigation';
import { CommercialIntelligenceView } from '../../../components/commercial-intelligence-view';
import { PageHeader } from '../../../components/page-header';
import { Button } from '../../../components/ui/button';
import { Field, Input, Select } from '../../../components/ui/field';
import { getCurrentIdentity } from '../../../services/api/auth';
import { getCommercialIntelligence } from '../../../services/api/commercial-intelligence';

export const dynamic = 'force-dynamic';
export default async function CommercialManagementPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const raw = await searchParams;
  const candidate = { period: raw.period, scope: raw.scope, from: raw.from || undefined, to: raw.to || undefined };
  const parsed = commercialIntelligenceQuerySchema.safeParse(candidate);
  const query = parsed.success ? parsed.data : commercialIntelligenceQuerySchema.parse({});
  const [identity, data] = await Promise.all([getCurrentIdentity(), getCommercialIntelligence(query)]);
  if (!identity || data === 'unauthorized') redirect('/login');
  if (data === 'forbidden') redirect('/dashboard/forbidden');
  return <div className="space-y-7"><PageHeader eyebrow="Central operacional" title="Gestao Comercial" description="Fatos comerciais, pendencias e resultados do escopo autorizado." />
    <form className="grid gap-3 border-y border-[var(--color-border)] py-4 sm:grid-cols-2 lg:grid-cols-5">
      <Field label="Periodo"><Select defaultValue={query.period} name="period"><option value="today">Hoje</option><option value="7d">7 dias</option><option value="30d">30 dias</option><option value="90d">90 dias</option><option value="custom">Personalizado</option></Select></Field>
      <Field label="Escopo"><Select defaultValue={data.scope} name="scope">{data.availableScopes.map(scope => <option value={scope} key={scope}>{scope === 'OWN' ? 'Minha carteira' : scope === 'TEAM' ? 'Minha equipe' : 'Todos'}</option>)}</Select></Field>
      <Field label="De"><Input defaultValue={query.from} name="from" type="date" /></Field><Field label="Ate"><Input defaultValue={query.to} name="to" type="date" /></Field><Button className="self-end" type="submit">Aplicar</Button>
    </form><CommercialIntelligenceView data={data} /></div>;
}
