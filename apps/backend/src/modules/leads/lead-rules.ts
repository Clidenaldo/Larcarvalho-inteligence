import type { LeadStatus } from '@larcarvalho/shared';

export const BUSINESS_TIME_ZONE = 'America/Fortaleza' as const;
export const ACTIVE_LEAD_STATUSES = [
  'NOVO',
  'EM_ATENDIMENTO',
  'CONTATO_REALIZADO',
  'QUALIFICADO',
  'PROPOSTA',
  'NEGOCIACAO',
] as const satisfies readonly LeadStatus[];
export const TERMINAL_LEAD_STATUSES = [
  'CONVERTIDO',
  'PERDIDO',
] as const satisfies readonly LeadStatus[];
const terminal = new Set<LeadStatus>(TERMINAL_LEAD_STATUSES);

export function fortalezaDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function fortalezaDayBounds(now = new Date()) {
  const start = new Date(`${fortalezaDate(now)}T00:00:00-03:00`);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

export function isLeadOverdue(
  lead: { proximoContatoEm: Date | null; status: LeadStatus },
  now = new Date(),
) {
  return Boolean(
    lead.proximoContatoEm &&
    lead.proximoContatoEm < now &&
    !terminal.has(lead.status),
  );
}
