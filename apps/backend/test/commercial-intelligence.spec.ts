import { commercialIntelligenceSchema, commercialIntelligenceQuerySchema } from '@larcarvalho/shared';
import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../src/core/auth/auth-context.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { CommercialIntelligenceService } from '../src/modules/commercial-intelligence/commercial-intelligence.service.js';

const actor = (role: AuthContext['user']['role'], denyFinancial = false): AuthContext => ({
  sessionId: 'session',
  user: { id: '67c84cbc-dc1d-4a24-8cfb-86a7ce99de10', nome: 'Pessoa', email: 'pessoa@example.com', role },
  teamIds: [], permissionOverrides: denyFinancial ? [{ permission: 'commissions.read', effect: 'DENY' }] : [],
});

function database(financial = false) {
  const count = async () => 0;
  return {
    lead: { count }, followUp: { count }, simulation: { count, findMany: async () => [] },
    proposal: { count, findMany: async () => [] }, proposalStatusHistory: { count }, sale: { count, findMany: async () => [] },
    saleContract: { count }, user: { findMany: async () => [] },
    commission: { findMany: async () => financial ? [{ status: 'CONFIRMADA', valorPrevisto: '90071992547409.93', valorConfirmado: '4850.00', valorRecebido: '2000.00' }] : [] },
  } as unknown as PrismaClient;
}

describe('commercial intelligence', () => {
  it('rejects escalation from OWN to ALL before querying', async () => {
    await expect(new CommercialIntelligenceService(database()).overview(actor('VENDEDOR'), commercialIntelligenceQuerySchema.parse({ scope: 'ALL' }))).rejects.toMatchObject({ statusCode: 403 });
  });

  it('returns factual zero rates and strips financial data without permission', async () => {
    const result = await new CommercialIntelligenceService(database()).overview(actor('VENDEDOR', true), commercialIntelligenceQuerySchema.parse({}));
    expect(result.scope).toBe('OWN');
    expect(result.conversions[0]).toMatchObject({ numerator: 0, denominator: 0, rate: null });
    expect(result).not.toHaveProperty('financial');
    expect(commercialIntelligenceSchema.parse(result)).toEqual(result);
  });

  it('preserves high monetary values and subtracts partial receipts in cents', async () => {
    const result = await new CommercialIntelligenceService(database(true)).overview(actor('SUPER_ADMIN'), commercialIntelligenceQuerySchema.parse({ scope: 'ALL' }));
    expect(result.financial).toEqual({ expected: '90071992547409.93', confirmed: '4850.00', received: '2000.00', confirmedReceivable: '2850.00' });
  });
});
