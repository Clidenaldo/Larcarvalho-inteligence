import { describe, expect, it } from 'vitest';
import {
  contractTransitions,
  saleNumberSchema,
  saleTransitions,
} from '@larcarvalho/shared';
import { calcCommissionCents } from '../src/modules/sales/commissions.service.js';

describe('sale status machine', () => {
  it('allows the contractual lifecycle in order', () => {
    const pairs = [
      ['RASCUNHO', 'AGUARDANDO_DOCUMENTOS'],
      ['AGUARDANDO_DOCUMENTOS', 'DOCUMENTOS_RECEBIDOS'],
      ['DOCUMENTOS_RECEBIDOS', 'ENVIADA_ADMINISTRADORA'],
      ['ENVIADA_ADMINISTRADORA', 'EM_ANALISE'],
      ['EM_ANALISE', 'APROVADA'],
      ['APROVADA', 'CONTRATADA'],
    ] as const;
    for (const [from, to] of pairs) {
      expect(saleTransitions[from]).toContain(to);
    }
  });
  it('blocks skipping stages and leaving terminal states', () => {
    expect(saleTransitions.RASCUNHO).not.toContain('CONTRATADA');
    expect(saleTransitions.CONTRATADA).toEqual([]);
    expect(saleTransitions.CANCELADA).toEqual([]);
    expect(saleTransitions.RECUSADA).toEqual([]);
    expect(saleTransitions.EM_ANALISE).toContain('RECUSADA');
  });
  it('allows cancel from any non-terminal stage', () => {
    for (const status of [
      'RASCUNHO',
      'AGUARDANDO_DOCUMENTOS',
      'DOCUMENTOS_RECEBIDOS',
      'ENVIADA_ADMINISTRADORA',
      'EM_ANALISE',
      'APROVADA',
    ] as const) {
      expect(saleTransitions[status]).toContain('CANCELADA');
    }
  });
});

describe('contract status machine', () => {
  it('follows RASCUNHO → EMITIDO → ASSINADO → ATIVO', () => {
    expect(contractTransitions.RASCUNHO).toContain('EMITIDO');
    expect(contractTransitions.EMITIDO).toContain('ASSINADO');
    expect(contractTransitions.ASSINADO).toContain('ATIVO');
    expect(contractTransitions.ATIVO).toEqual([]);
  });
});

describe('sale number format', () => {
  it('accepts VEN-YYYY-NNNNNN', () => {
    expect(saleNumberSchema.safeParse('VEN-2026-000123').success).toBe(true);
    expect(saleNumberSchema.safeParse('uuid-qualquer').success).toBe(false);
  });
});

describe('calcCommissionCents', () => {
  it('computes percentual over base without float drift', () => {
    expect(calcCommissionCents('150000.00', '2.50', null)).toBe(375000n);
    expect(calcCommissionCents('100.00', '33.333333', null)).toBe(3333n);
    expect(calcCommissionCents('0.01', '50', null)).toBe(1n);
    expect(calcCommissionCents('90071992547409.93', '100', null)).toBe(
      9007199254740993n,
    );
  });
  it('prefers valorFixo when provided', () => {
    expect(calcCommissionCents('150000.00', '2.50', '5000.00')).toBe(500000n);
  });
  it('throws without any basis', () => {
    expect(() => calcCommissionCents('150000.00', null, null)).toThrow();
  });
});
