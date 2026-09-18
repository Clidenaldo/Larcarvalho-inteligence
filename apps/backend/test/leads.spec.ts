import { leadInteractionTypes } from '@larcarvalho/shared';
import { describe, expect, it } from 'vitest';
import { allowedLeadTransitions } from '../src/modules/leads/leads.service.js';
import { hasPermission } from '../src/core/auth/rbac.js';

describe('CRM lead rules', () => {
  it('allows the intended commercial flow and controlled loss/reopen', () => {
    expect(allowedLeadTransitions.NOVO).toContain('EM_ATENDIMENTO');
    expect(allowedLeadTransitions.NEGOCIACAO).toContain('CONVERTIDO');
    expect(allowedLeadTransitions.QUALIFICADO).toContain('PERDIDO');
    expect(allowedLeadTransitions.PERDIDO).toEqual(['EM_ATENDIMENTO']);
    expect(allowedLeadTransitions.CONVERTIDO).toEqual([]);
  });
  it('assigns granular CRM permissions without granting operator access', () => {
    expect(hasPermission('VENDEDOR', 'leads.read_own')).toBe(true);
    expect(hasPermission('VENDEDOR', 'leads.read_all')).toBe(false);
    expect(hasPermission('GESTOR', 'leads.assign')).toBe(true);
    expect(hasPermission('ADMIN', 'leads.read_all')).toBe(true);
    expect(hasPermission('SUPER_ADMIN', 'leads.read_all')).toBe(true);
    expect(hasPermission('OPERADOR', 'leads.read_own')).toBe(false);
  });
  it('keeps the manual interaction taxonomy small and explicit', () => {
    expect(leadInteractionTypes).toEqual([
      'NOTA',
      'LIGACAO',
      'WHATSAPP',
      'EMAIL',
      'REUNIAO',
      'STATUS',
      'OUTRO',
    ]);
  });
});
