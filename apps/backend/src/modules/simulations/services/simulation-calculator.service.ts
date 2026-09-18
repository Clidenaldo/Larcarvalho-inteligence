import type {
  CreateSimulationRequest,
  SimulationResult,
} from '@larcarvalho/shared';

export const simulationEngineVersion = 'LC-SIM-2.0.0';

export interface CalculationRule {
  readonly id: string;
  readonly version: number;
  readonly administratorId: string;
  readonly administratorName: string;
  readonly productId: string | null;
  readonly productName: string | null;
  readonly category: CreateSimulationRequest['category'];
  readonly administrationFeePercent: string | null;
  readonly administrationFeeAmount: string | null;
  readonly reserveFundPercent: string | null;
  readonly insurancePercent: string | null;
  readonly insuranceAmount: string | null;
  readonly adhesionFeePercent: string | null;
  readonly adhesionFeeAmount: string | null;
  readonly maxEmbeddedBidPercent: string | null;
  readonly embeddedBidBasis: 'CONTRACTED_CREDIT' | 'PLAN_TOTAL';
  readonly minimumTermMonths: number | null;
  readonly maximumTermMonths: number | null;
  readonly reducedInstallmentPercent: string | null;
  readonly reducedUntilContemplation: boolean;
  readonly diluteReducedInstallments: boolean;
  readonly categoryValueCreditRatio: string | null;
  readonly bidType: 'FIXED' | 'FREE' | 'PERCENTUAL';
  readonly ownBidMaxPercent: string | null;
  readonly inProgressAllowed: boolean;
  readonly structuredOperationEligible: boolean;
  readonly notes: string | null;
  readonly updatedAt: string;
}

export interface CalculationContext {
  readonly roundingMode: 'HALF_UP' | 'UP' | 'DOWN';
  readonly ruleVersionPrefix: string;
  readonly group?: { id: string; code: string } | undefined;
  readonly quota?: { id: string; number: string } | undefined;
}

type CalculatedResult = Omit<SimulationResult, 'id'> & {
  readonly commercialRuleId: string;
};

const adherenceWeights = {
  context: 0.4,
  bidHeadroom: 0.35,
  term: 0.25,
} as const;
const adherenceAssumption =
  'Índice de aderência: contexto selecionado peso 40% (cota 1,00, grupo 0,75, apenas categoria 0,40), folga do lance embutido peso 35% e proximidade do prazo desejado ao centro da faixa da regra peso 25%.';

const adherenceScore = (
  input: CreateSimulationRequest,
  rule: CalculationRule,
  context: CalculationContext,
) => {
  const contextFit = context.quota ? 1 : context.group ? 0.75 : 0.4;
  const maxEmbedded = Number(rule.maxEmbeddedBidPercent!);
  const ratio = input.includeEmbeddedBid === false ? 0 : Number(input.embeddedBidPercent);
  const bidHeadroom = Math.min(1, Math.max(0, 1 - ratio / maxEmbedded));
  const minimum = rule.minimumTermMonths!;
  const maximum = rule.maximumTermMonths!;
  const span = maximum - minimum;
  const termFit =
    span > 0
      ? Math.min(
          1,
          Math.max(
            0,
            1 - Math.abs(input.desiredTermMonths - (minimum + maximum) / 2) / (span / 2),
          ),
        )
      : 1;
  return {
    score: Math.round(
      100 *
        (adherenceWeights.context * contextFit +
          adherenceWeights.bidHeadroom * bidHeadroom +
          adherenceWeights.term * termFit),
    ),
    components: { contextFit, bidHeadroom, termFit },
  };
};

const cents = (value: string) => Math.round(Number(value) * 100);
const decimal = (value: number) => (value / 100).toFixed(2);
const round = (value: number, mode: CalculationContext['roundingMode']) =>
  mode === 'UP'
    ? Math.ceil(value)
    : mode === 'DOWN'
      ? Math.floor(value)
      : Math.round(value);
const percentOf = (
  baseCents: number,
  percent: string,
  mode: CalculationContext['roundingMode'],
) => round((baseCents * Number(percent)) / 100, mode);
const moneyComponent = (
  baseCents: number,
  percent: string | null,
  amount: string | null,
  mode: CalculationContext['roundingMode'],
) =>
  amount !== null ? cents(amount) : percentOf(baseCents, percent ?? '0', mode);

const incompleteFields = (
  input: CreateSimulationRequest,
  rule: CalculationRule,
) => {
  const missing: string[] = [];
  if (
    rule.administrationFeePercent === null &&
    rule.administrationFeeAmount === null
  )
    missing.push('taxa de administração');
  if (rule.reserveFundPercent === null) missing.push('fundo de reserva');
  if (rule.insurancePercent === null && rule.insuranceAmount === null)
    missing.push('seguro');
  if (rule.adhesionFeePercent === null && rule.adhesionFeeAmount === null)
    missing.push('taxa de adesão');
  if (rule.maxEmbeddedBidPercent === null)
    missing.push('limite de lance embutido');
  if (rule.minimumTermMonths === null || rule.maximumTermMonths === null)
    missing.push('limites de prazo');
  if (
    input.creditMode === 'CATEGORY_VALUE' &&
    rule.categoryValueCreditRatio === null
  )
    missing.push('proporção de crédito sobre valor da categoria');
  return missing;
};

const unavailable = (
  input: CreateSimulationRequest,
  rule: CalculationRule,
  context: CalculationContext,
  status: 'INCOMPLETE_DATA' | 'INELIGIBLE',
  warnings: string[],
): CalculatedResult => ({
  badges: [],
  commercialRuleId: rule.id,
  calculationStatus: status,
  calculationWarnings: warnings,
  ruleVersion: `${context.ruleVersionPrefix}-${rule.version}`,
  sourceDataUpdatedAt: rule.updatedAt,
  administratorId: rule.administratorId,
  administratorName: rule.administratorName,
  productId: rule.productId,
  productName: rule.productName,
  groupId: context.group?.id ?? null,
  groupCode: context.group?.code ?? null,
  quotaId: context.quota?.id ?? null,
  quotaNumber: context.quota?.number ?? null,
  category: input.category,
  contractedCredit: null,
  netCredit: null,
  totalTermMonths: input.desiredTermMonths,
  remainingTermMonths: Math.max(
    0,
    input.desiredTermMonths - input.paidInstallments,
  ),
  initialInstallment: null,
  reducedInstallment: null,
  laterInstallment: null,
  ownBidAmount: input.ownBidAmount,
  embeddedBidAmount: null,
  totalBidAmount: null,
  totalBidPercent: null,
  administrationFee: null,
  reserveFund: null,
  insurance: null,
  adhesionFee: null,
  adherenceScore: null,
  assumptions: [
    'Nenhum valor financeiro foi estimado porque os dados não permitem cálculo seguro.',
  ],
});

export class SimulationCalculatorService {
  calculate(
    input: CreateSimulationRequest,
    rule: CalculationRule,
    context: CalculationContext,
  ): CalculatedResult {
    const missing = incompleteFields(input, rule);
    if (missing.length)
      return unavailable(input, rule, context, 'INCOMPLETE_DATA', [
        `Regra incompleta: informe ${missing.join(', ')}.`,
      ]);

    const ineligible: string[] = [];
    if (
      input.desiredTermMonths < rule.minimumTermMonths! ||
      input.desiredTermMonths > rule.maximumTermMonths!
    )
      ineligible.push(
        `Prazo fora da faixa configurada de ${rule.minimumTermMonths} a ${rule.maximumTermMonths} meses.`,
      );
    if (input.paidInstallments >= input.desiredTermMonths)
      ineligible.push(
        'A quantidade de parcelas pagas deve ser menor que o prazo.',
      );
    if (input.paidInstallments > 0 && !rule.inProgressAllowed)
      ineligible.push('A regra não permite cotas em andamento.');
    if (input.structuredOperation && !rule.structuredOperationEligible)
      ineligible.push('A regra não permite operação estruturada.');
    if (
      Number(input.embeddedBidPercent) > Number(rule.maxEmbeddedBidPercent)
    )
      ineligible.push(
        `Lance embutido superior ao limite de ${rule.maxEmbeddedBidPercent}%.`,
      );
    if (
      input.creditMode === 'NET_CREDIT' &&
      input.includeEmbeddedBid !== false &&
      Number(input.embeddedBidPercent) >= 100
    )
      ineligible.push(
        'Crédito líquido não pode ser calculado com lance embutido de 100%.',
      );
    if (ineligible.length)
      return unavailable(input, rule, context, 'INELIGIBLE', ineligible);

    const mode = context.roundingMode;
    const includeInsurance = input.includeInsurance ?? true;
    const includeEmbeddedBid = input.includeEmbeddedBid ?? true;
    const embeddedRatio = includeEmbeddedBid ? Number(input.embeddedBidPercent) / 100 : 0;
    const requestedCents = cents(input.requestedCredit);

    const feePercentSum =
      (rule.administrationFeeAmount === null
        ? Number(rule.administrationFeePercent ?? 0)
        : 0) +
      Number(rule.reserveFundPercent ?? 0) +
      (includeInsurance && rule.insuranceAmount === null
        ? Number(rule.insurancePercent ?? 0)
        : 0) +
      (rule.adhesionFeeAmount === null
        ? Number(rule.adhesionFeePercent ?? 0)
        : 0);
    const feeAmountCents =
      cents(rule.administrationFeeAmount ?? '0') +
      (includeInsurance ? cents(rule.insuranceAmount ?? '0') : 0) +
      cents(rule.adhesionFeeAmount ?? '0');

    let contractedCents: number;
    if (input.creditMode === 'CATEGORY_VALUE') {
      contractedCents = round(
        requestedCents * (Number(rule.categoryValueCreditRatio) / 100),
        mode,
      );
    } else if (input.creditMode === 'NET_CREDIT') {
      if (rule.embeddedBidBasis === 'PLAN_TOTAL') {
        const denominator = 1 - embeddedRatio * (1 + feePercentSum / 100);
        if (denominator <= 0)
          return unavailable(
            input,
            rule,
            context,
            'INELIGIBLE',
            [
              'Não é possível obter o crédito líquido desejado com este lance embutido: o lance sobre o total do plano superaria o crédito contratado.',
            ],
          );
        contractedCents = round(
          (requestedCents + embeddedRatio * feeAmountCents) / denominator,
          mode,
        );
      } else {
        contractedCents = round(requestedCents / (1 - embeddedRatio), mode);
      }
    } else {
      contractedCents = requestedCents;
    }

    const ownBidCents = cents(input.ownBidAmount);
    const bidTypeWarnings: string[] = [];
    if (rule.bidType === 'FIXED' && ownBidCents > 0)
      bidTypeWarnings.push(
        'Regra com lance fixo: o lance próprio é decidido na assembleia e não pode ser informado como valor livre na simulação.',
      );
    if (
      rule.bidType === 'PERCENTUAL' &&
      rule.ownBidMaxPercent !== null &&
      ownBidCents > 0 &&
      ownBidCents > percentOf(contractedCents, rule.ownBidMaxPercent, mode)
    )
      bidTypeWarnings.push(
        `Lance próprio acima do limite de ${rule.ownBidMaxPercent}% do crédito contratado para esta regra.`,
      );
    if (bidTypeWarnings.length)
      return unavailable(input, rule, context, 'INELIGIBLE', bidTypeWarnings);

    const netRequestedCents =
      input.creditMode === 'NET_CREDIT' ? requestedCents : null;
    const administrationCents = moneyComponent(
      contractedCents,
      rule.administrationFeePercent,
      rule.administrationFeeAmount,
      mode,
    );
    const reserveCents = percentOf(
      contractedCents,
      rule.reserveFundPercent!,
      mode,
    );
    const insuranceCents = includeInsurance
      ? moneyComponent(
          contractedCents,
          rule.insurancePercent,
          rule.insuranceAmount,
          mode,
        )
      : 0;
    const adhesionCents = moneyComponent(
      contractedCents,
      rule.adhesionFeePercent,
      rule.adhesionFeeAmount,
      mode,
    );
    const planTotalCents =
      contractedCents +
      administrationCents +
      reserveCents +
      insuranceCents +
      adhesionCents;
    const bidBaseCents =
      rule.embeddedBidBasis === 'PLAN_TOTAL'
        ? planTotalCents
        : contractedCents;
    const embeddedBidCents =
      netRequestedCents !== null
        ? contractedCents - netRequestedCents
        : round(bidBaseCents * embeddedRatio, mode);
    const netCents = contractedCents - embeddedBidCents;
    const installmentCents = round(
      planTotalCents / input.desiredTermMonths,
      mode,
    );
    const reducedCents =
      rule.reducedInstallmentPercent === null
        ? null
        : percentOf(installmentCents, rule.reducedInstallmentPercent, mode);
    const remainingTermMonths =
      input.desiredTermMonths - input.paidInstallments;
    let laterCents = installmentCents;
    if (
      rule.diluteReducedInstallments &&
      rule.reducedUntilContemplation &&
      reducedCents !== null &&
      input.paidInstallments > 0 &&
      remainingTermMonths > 0
    ) {
      const discountPerMonth = installmentCents - reducedCents;
      const dilution = round(
        (discountPerMonth * input.paidInstallments) / remainingTermMonths,
        mode,
      );
      laterCents = installmentCents + dilution;
    }
    const totalBidCents = ownBidCents + embeddedBidCents;
    const totalBidPercent = ((totalBidCents / contractedCents) * 100).toFixed(
      4,
    );
    const adherence = adherenceScore(input, rule, context);
    const assumptions = [
      `Cálculo executado exclusivamente com a regra ${context.ruleVersionPrefix}-${rule.version}.`,
      `Valores arredondados pelo modo ${mode}.`,
      'O lance próprio não reduz o crédito contratado.',
      'O lance embutido reduz o crédito disponível após a contemplação.',
      ...(input.creditMode === 'CATEGORY_VALUE'
        ? [
            'O crédito contratado foi derivado do valor da categoria pela proporção configurada na regra.',
          ]
        : []),
      ...(rule.embeddedBidBasis === 'PLAN_TOTAL'
        ? [
            'O lance embutido é calculado sobre o total do plano (crédito + taxas), conforme a base configurada na regra.',
          ]
        : []),
      ...(netRequestedCents !== null
        ? [
            'O lance embutido absorve o arredondamento para preservar exatamente o crédito líquido solicitado.',
          ]
        : []),
      ...(rule.bidType === 'FIXED'
        ? [
            'A regra adota lance fixo: o valor do lance próprio é decidido na assembleia.',
          ]
        : []),
      ...(rule.bidType === 'PERCENTUAL' && rule.ownBidMaxPercent !== null
        ? [
            `A regra limita o lance próprio a ${rule.ownBidMaxPercent}% do crédito contratado.`,
          ]
        : []),
      ...(includeInsurance === false
        ? ['O seguro foi excluído desta simulação a pedido do cenário.']
        : []),
      ...(includeEmbeddedBid === false
        ? ['O lance embutido foi excluído desta simulação a pedido do cenário.']
        : []),
      adherenceAssumption,
      `Componentes observados: contexto ${adherence.components.contextFit.toFixed(2)}, folga de lance ${adherence.components.bidHeadroom.toFixed(2)} e prazo ${adherence.components.termFit.toFixed(2)}.`,
      ...(rule.reducedUntilContemplation && reducedCents !== null
        ? [
            'A parcela reduzida vale somente até a contemplação.',
            ...(rule.diluteReducedInstallments
              ? [
                  'Os descontos das parcelas reduzidas pagas até a contemplação são diluídos nas parcelas restantes pós-contemplação.',
                  ...(input.paidInstallments > 0
                    ? [
                        `Diluição pós-contemplação: desconto mensal de R$ ${decimal(installmentCents - reducedCents)} diluído em ${remainingTermMonths} parcelas restantes.`,
                      ]
                    : []),
                ]
              : []),
          ]
        : []),
      ...(input.paidInstallments > 0
        ? [
            'O prazo restante considera as parcelas informadas como já pagas; não foi presumido saldo devedor externo.',
          ]
        : []),
      ...(rule.notes ? [rule.notes] : []),
    ];

    return {
      badges: [],
      commercialRuleId: rule.id,
      calculationStatus: 'COMPLETE',
      calculationWarnings: [],
      ruleVersion: `${context.ruleVersionPrefix}-${rule.version}`,
      sourceDataUpdatedAt: rule.updatedAt,
      administratorId: rule.administratorId,
      administratorName: rule.administratorName,
      productId: rule.productId,
      productName: rule.productName,
      groupId: context.group?.id ?? null,
      groupCode: context.group?.code ?? null,
      quotaId: context.quota?.id ?? null,
      quotaNumber: context.quota?.number ?? null,
      category: input.category,
      contractedCredit: decimal(contractedCents),
      netCredit: decimal(netCents),
      totalTermMonths: input.desiredTermMonths,
      remainingTermMonths,
      initialInstallment: decimal(installmentCents),
      reducedInstallment: reducedCents === null ? null : decimal(reducedCents),
      laterInstallment: decimal(laterCents),
      ownBidAmount: decimal(ownBidCents),
      embeddedBidAmount: decimal(embeddedBidCents),
      totalBidAmount: decimal(totalBidCents),
      totalBidPercent,
      administrationFee: decimal(administrationCents),
      reserveFund: decimal(reserveCents),
      insurance: decimal(insuranceCents),
      adhesionFee: decimal(adhesionCents),
      adherenceScore: adherence.score,
      assumptions,
    };
  }
}