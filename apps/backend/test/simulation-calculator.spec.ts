import type { CreateSimulationRequest } from '@larcarvalho/shared';
import { describe, expect, it } from 'vitest';

import {
  SimulationCalculatorService,
  type CalculationRule,
} from '../src/modules/simulations/services/simulation-calculator.service.js';

const calculator = new SimulationCalculatorService();
const input = (
  overrides: Partial<CreateSimulationRequest> = {},
): CreateSimulationRequest => ({
  category: 'PESADOS',
  creditMode: 'CONTRACTED_CREDIT',
  requestedCredit: '200000',
  desiredTermMonths: 100,
  ownBidAmount: '10000',
  embeddedBidPercent: '10',
  includeInsurance: true,
  includeEmbeddedBid: true,
  paidInstallments: 0,
  structuredOperation: false,
  administratorIds: [],
  productIds: [],
  groupIds: [],
  quotaIds: [],
  sort: 'ADHERENCE',
  ...overrides,
});
const rule = (overrides: Partial<CalculationRule> = {}): CalculationRule => ({
  id: '11111111-1111-4111-8111-111111111111',
  version: 3,
  administratorId: '22222222-2222-4222-8222-222222222222',
  administratorName: 'Administradora Teste',
  productId: null,
  productName: null,
  category: 'PESADOS',
  administrationFeePercent: '15',
  administrationFeeAmount: null,
  reserveFundPercent: '2',
  insurancePercent: '1',
  insuranceAmount: null,
  adhesionFeePercent: '0',
  adhesionFeeAmount: null,
  maxEmbeddedBidPercent: '30',
  embeddedBidBasis: 'CONTRACTED_CREDIT',
  minimumTermMonths: 60,
  maximumTermMonths: 120,
  reducedInstallmentPercent: '50',
  reducedUntilContemplation: true,
  diluteReducedInstallments: false,
  categoryValueCreditRatio: null,
  bidType: 'FREE',
  ownBidMaxPercent: null,
  inProgressAllowed: true,
  structuredOperationEligible: true,
  notes: null,
  updatedAt: '2026-09-07T10:00:00.000Z',
  ...overrides,
});
const context = {
  roundingMode: 'HALF_UP' as const,
  ruleVersionPrefix: 'LC',
};

describe('simulation calculator', () => {
  it('calculates contracted credit, own bid, embedded bid and reduced installment', () => {
    const result = calculator.calculate(input(), rule(), context);
    expect(result).toMatchObject({
      calculationStatus: 'COMPLETE',
      contractedCredit: '200000.00',
      netCredit: '180000.00',
      ownBidAmount: '10000.00',
      embeddedBidAmount: '20000.00',
      totalBidAmount: '30000.00',
      totalBidPercent: '15.0000',
      administrationFee: '30000.00',
      reserveFund: '4000.00',
      insurance: '2000.00',
      reducedInstallment: '1180.00',
      laterInstallment: '2360.00',
    });
  });

  it('grosses up contracted credit from desired net credit', () => {
    const result = calculator.calculate(
      input({ creditMode: 'NET_CREDIT', requestedCredit: '180000' }),
      rule(),
      context,
    );
    expect(result.contractedCredit).toBe('200000.00');
    expect(result.netCredit).toBe('180000.00');
  });

  it('supports structured and in-progress scenarios only when configured', () => {
    expect(
      calculator.calculate(
        input({ structuredOperation: true, paidInstallments: 10 }),
        rule(),
        context,
      ),
    ).toMatchObject({ calculationStatus: 'COMPLETE', remainingTermMonths: 90 });
    const denied = calculator.calculate(
      input({ structuredOperation: true, paidInstallments: 10 }),
      rule({
        structuredOperationEligible: false,
        inProgressAllowed: false,
      }),
      context,
    );
    expect(denied.calculationStatus).toBe('INELIGIBLE');
    expect(denied.calculationWarnings).toHaveLength(2);
  });

  it('never invents values when a required rule field is missing', () => {
    const result = calculator.calculate(
      input(),
      rule({ administrationFeePercent: null }),
      context,
    );
    expect(result.calculationStatus).toBe('INCOMPLETE_DATA');
    expect(result.initialInstallment).toBeNull();
    expect(result.calculationWarnings[0]).toContain('taxa de administração');
  });

  it('derives the adherence score from explainable weighted components', () => {
    // contexto categoria 0,40 · folga de lance 1-10/30 · prazo |100-90|/30
    const categoryOnly = calculator.calculate(input(), rule(), context);
    expect(categoryOnly.adherenceScore).toBe(56);
    const withQuota = calculator.calculate(input(), rule(), {
      ...context,
      group: { id: 'g1', code: 'G-001' },
      quota: { id: 'q1', number: '001' },
    });
    expect(withQuota.adherenceScore).toBe(80);
    const maxedBid = calculator.calculate(
      input({ embeddedBidPercent: '30' }),
      rule(),
      context,
    );
    expect(maxedBid.adherenceScore).toBe(33);
    const centeredTerm = calculator.calculate(
      input({ desiredTermMonths: 90 }),
      rule(),
      context,
    );
    expect(centeredTerm.adherenceScore).toBeGreaterThan(
      categoryOnly.adherenceScore!,
    );
  });

  it('explains the ranking weights in the result assumptions', () => {
    const result = calculator.calculate(input(), rule(), context);
    const joined = result.assumptions.join(' ');
    expect(joined).toContain('Índice de aderência');
    expect(joined).toContain('peso 40%');
    expect(joined).toContain('peso 35%');
    expect(joined).toContain('peso 25%');
    expect(joined).toContain('Componentes observados');
  });

  it('dilutes the paid reduced-installment discount into later installments when configured', () => {
    const result = calculator.calculate(
      input({ paidInstallments: 20 }),
      rule({ diluteReducedInstallments: true }),
      context,
    );
    expect(result.initialInstallment).toBe('2360.00');
    expect(result.reducedInstallment).toBe('1180.00');
    expect(result.laterInstallment).toBe('2655.00');
    expect(result.assumptions.join(' ')).toContain(
      'desconto mensal de R$ 1180.00 diluído em 80 parcelas restantes',
    );
  });

  it('does not dilute when the rule does not configure dilution', () => {
    const result = calculator.calculate(
      input({ paidInstallments: 20 }),
      rule(),
      context,
    );
    expect(result.laterInstallment).toBe('2360.00');
  });

  it('bases the embedded bid on the full plan total when configured', () => {
    const result = calculator.calculate(
      input(),
      rule({ embeddedBidBasis: 'PLAN_TOTAL' }),
      context,
    );
    expect(result.embeddedBidAmount).toBe('23600.00');
    expect(result.netCredit).toBe('176400.00');
    expect(result.assumptions.join(' ')).toContain(
      'total do plano (crédito + taxas)',
    );
  });

  it('grosses up the net credit with a plan-total bid base', () => {
    const result = calculator.calculate(
      input({ creditMode: 'NET_CREDIT', requestedCredit: '180000' }),
      rule({ embeddedBidBasis: 'PLAN_TOTAL' }),
      context,
    );
    expect(result.contractedCredit).toBe('204081.63');
    expect(result.netCredit).toBe('180000.00');
    expect(result.embeddedBidAmount).toBe('24081.63');
  });

  it('grosses up the net credit with flat-fee rules and a plan-total bid base', () => {
    const result = calculator.calculate(
      input({ creditMode: 'NET_CREDIT', requestedCredit: '180000' }),
      rule({
        embeddedBidBasis: 'PLAN_TOTAL',
        administrationFeePercent: null,
        administrationFeeAmount: '500',
        insurancePercent: null,
        insuranceAmount: '300',
      }),
      context,
    );
    expect(result.contractedCredit).toBe('200534.52');
    expect(result.netCredit).toBe('180000.00');
    expect(result.embeddedBidAmount).toBe('20534.52');
    expect(result.insurance).toBe('300.00');
  });

  it('rejects a net credit plan-total bid that cannot close', () => {
    const result = calculator.calculate(
      input({
        creditMode: 'NET_CREDIT',
        requestedCredit: '180000',
        embeddedBidPercent: '90',
      }),
      rule({
        embeddedBidBasis: 'PLAN_TOTAL',
        maxEmbeddedBidPercent: '100',
        insurancePercent: '80',
      }),
      context,
    );
    expect(result.calculationStatus).toBe('INELIGIBLE');
    expect(result.calculationWarnings[0]).toContain('lance sobre o total');
  });

  it('derives the contracted credit from the category value when configured', () => {
    const result = calculator.calculate(
      input({ creditMode: 'CATEGORY_VALUE' }),
      rule({ categoryValueCreditRatio: '90' }),
      context,
    );
    expect(result.contractedCredit).toBe('180000.00');
    expect(result.netCredit).toBe('162000.00');
    expect(result.assumptions.join(' ')).toContain('valor da categoria');
  });

  it('flags incomplete data when the category-value ratio is missing', () => {
    const result = calculator.calculate(
      input({ creditMode: 'CATEGORY_VALUE' }),
      rule(),
      context,
    );
    expect(result.calculationStatus).toBe('INCOMPLETE_DATA');
    expect(result.calculationWarnings[0]).toContain('valor da categoria');
  });

  it('excludes insurance from the plan when the scenario opts out', () => {
    const result = calculator.calculate(
      input({ includeInsurance: false }),
      rule(),
      context,
    );
    expect(result.insurance).toBe('0.00');
    expect(result.initialInstallment).toBe('2340.00');
    expect(result.laterInstallment).toBe('2340.00');
    expect(result.assumptions.join(' ')).toContain(
      'seguro foi excluído desta simulação',
    );
  });

  it('removes the embedded bid when the scenario opts out', () => {
    const result = calculator.calculate(
      input({ ownBidAmount: '0', includeEmbeddedBid: false }),
      rule(),
      context,
    );
    expect(result.embeddedBidAmount).toBe('0.00');
    expect(result.totalBidAmount).toBe('0.00');
    expect(result.netCredit).toBe('200000.00');
    expect(result.assumptions.join(' ')).toContain(
      'lance embutido foi excluído desta simulação',
    );
  });

  it('keeps grossed-up net credit exact when the embedded bid is excluded', () => {
    const result = calculator.calculate(
      input({
        creditMode: 'NET_CREDIT',
        requestedCredit: '180000',
        includeEmbeddedBid: false,
      }),
      rule(),
      context,
    );
    expect(result.contractedCredit).toBe('180000.00');
    expect(result.netCredit).toBe('180000.00');
    expect(result.embeddedBidAmount).toBe('0.00');
  });

  it('applies the scenario term override', () => {
    const result = calculator.calculate(
      input({ desiredTermMonths: 84 }),
      rule(),
      context,
    );
    expect(result.initialInstallment).toBe('2809.52');
    expect(result.reducedInstallment).toBe('1404.76');
    expect(result.remainingTermMonths).toBe(84);
  });

  it('rejects an own bid under a fixed-bid rule', () => {
    const result = calculator.calculate(
      input(),
      rule({ bidType: 'FIXED' }),
      context,
    );
    expect(result.calculationStatus).toBe('INELIGIBLE');
    expect(result.calculationWarnings[0]).toContain('lance fixo');
  });

  it('caps the own bid under a percentual-bid rule', () => {
    const blocked = calculator.calculate(
      input({ ownBidAmount: '25000' }),
      rule({ bidType: 'PERCENTUAL', ownBidMaxPercent: '10' }),
      context,
    );
    expect(blocked.calculationStatus).toBe('INELIGIBLE');
    expect(blocked.calculationWarnings[0]).toContain(
      'limite de 10% do crédito contratado',
    );
    const allowed = calculator.calculate(
      input({ ownBidAmount: '15000' }),
      rule({ bidType: 'PERCENTUAL', ownBidMaxPercent: '10' }),
      context,
    );
    expect(allowed.calculationStatus).toBe('COMPLETE');
    expect(allowed.totalBidAmount).toBe('35000.00');
  });
});
