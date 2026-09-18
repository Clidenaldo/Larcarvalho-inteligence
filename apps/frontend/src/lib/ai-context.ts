import type { AiContextType } from '@larcarvalho/shared';

export interface AiRouteContext {
  readonly id?: string;
  readonly label: string;
  readonly type: AiContextType;
}

function segment(pathname: string, pattern: RegExp): string | undefined {
  const match = pathname.match(pattern);
  const id = match?.[1];
  if (!id || id === 'nova') return undefined;
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

/**
 * Derives the minimal AI context (type + id) from the current route. Only
 * identifiers travel to the client; the backend loads authorized records.
 */
export function deriveAiContext(pathname: string | null): AiRouteContext {
  const path = pathname ?? '';
  if (path.startsWith('/dashboard/gestao-comercial'))
    return { label: 'Gestao Comercial', type: 'COMMERCIAL_MANAGEMENT' };
  if (path.startsWith('/dashboard/base-conhecimento'))
    return { label: 'Base de conhecimento', type: 'KNOWLEDGE' };
  const leadId = segment(path, /\/dashboard\/crm\/leads\/([^/]+)/);
  if (leadId) return { id: leadId, label: 'Lead', type: 'LEAD' };
  const customerId = segment(path, /\/dashboard\/clientes\/([^/]+)/);
  if (customerId) return { id: customerId, label: 'Cliente', type: 'LEAD' };
  const simulationId = segment(path, /\/simulacoes\/([^/]+)/);
  if (simulationId)
    return { id: simulationId, label: 'Simulação', type: 'SIMULATION' };
  if (path.startsWith('/dashboard/comparador'))
    return { label: 'Comparador', type: 'COMPARATOR' };
  const proposalId = segment(path, /\/propostas\/([^/]+)/);
  if (proposalId)
    return { id: proposalId, label: 'Proposta', type: 'PROPOSAL' };
  const saleId = segment(path, /\/dashboard\/vendas\/([^/]+)/);
  if (saleId) return { id: saleId, label: 'Venda', type: 'SALE' };
  if (path.startsWith('/dashboard'))
    return { label: 'Painel', type: 'DASHBOARD' };
  return { label: 'Geral', type: 'GENERAL' };
}
