import { Construction } from 'lucide-react';
import { notFound } from 'next/navigation';

import { Card } from '../../../../components/ui/card';

const moduleNames: Record<string, string> = {
  administradoras: 'Administradoras',
  analises: 'Análises',
  assembleias: 'Assembleias',
  auditoria: 'Auditoria',
  comparador: 'Comparador',
  configuracoes: 'Configurações',
  crm: 'CRM',
  grupos: 'Grupos',
  historico: 'Histórico',
  importacoes: 'Importações',
  integracoes: 'Integrações',
  leads: 'Leads',
  produtos: 'Produtos',
  qualidade: 'Qualidade dos dados',
  simulador: 'Simulador',
};

export default async function ModulePlaceholderPage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const name = moduleNames[slug];
  if (!name) notFound();
  return (
    <Card className="grid min-h-[28rem] place-items-center px-6 py-14 text-center">
      <div>
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
          <Construction aria-hidden="true" className="h-7 w-7" />
        </div>
        <p className="mt-6 text-xs font-bold tracking-[0.14em] text-[var(--color-primary)] uppercase">
          {name}
        </p>
        <h2 className="mt-2 text-2xl font-semibold">Módulo em preparação</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--color-muted)]">
          A navegação está preparada, mas nenhuma funcionalidade ou dado
          comercial foi criado nesta fase.
        </p>
      </div>
    </Card>
  );
}
