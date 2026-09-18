import type { TimelineItem } from '@larcarvalho/shared';

import { Badge } from './ui/badge';
import { Card } from './ui/card';

const kindLabels: Record<TimelineItem['kind'], string> = {
  FOLLOWUP_CANCELED: 'Follow-up cancelado',
  FOLLOWUP_COMPLETED: 'Follow-up concluído',
  FOLLOWUP_SCHEDULED: 'Follow-up agendado',
  INTERACTION: 'Interação',
  LEAD_CREATED: 'Lead criado',
  PROPOSAL_CREATED: 'Proposta criada',
  PROPOSAL_STATUS_CHANGED: 'Status da proposta',
  SIMULATION_CREATED: 'Simulação criada',
  SALE_CREATED: 'Venda criada',
  SALE_STATUS_CHANGED: 'Status da venda',
  CONTRACT_CREATED: 'Contrato criado',
  CONTRACT_STATUS_CHANGED: 'Status do contrato',
  COMMISSION_CREATED: 'Comissão registrada',
  COMMISSION_STATUS_CHANGED: 'Status da comissão',
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR');
}

export function CustomerTimeline({ items }: { readonly items: TimelineItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted)]">
        Nenhum evento registrado ainda.
      </p>
    );
  }
  return (
    <ol className="space-y-3">
      {items.map((item) => (
        <li key={item.id}>
          <Card className="space-y-1 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{kindLabels[item.kind]}</Badge>
              <span className="text-xs text-[var(--color-muted)]">
                {formatDateTime(item.occurredAt)}
              </span>
              {item.actorName ? (
                <span className="text-xs text-[var(--color-muted)]">· {item.actorName}</span>
              ) : null}
            </div>
            <p className="text-sm">{item.summary}</p>
          </Card>
        </li>
      ))}
    </ol>
  );
}
