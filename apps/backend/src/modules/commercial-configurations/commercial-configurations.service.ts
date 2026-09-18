import type {
  CommercialConfiguration,
  CreateProductCommercialRuleRequest,
  ProductCommercialRule,
  ProductCommercialRuleListQuery,
  UpdateCommercialConfigurationRequest,
  UpdateProductCommercialRuleRequest,
} from '@larcarvalho/shared';
import type { AuthContext } from '../../core/auth/auth-context.js';
import { AppError } from '../../core/errors/app-error.js';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import type { RequestMetadata } from '../identity/identity.service.js';

const fail = (
  code:
    | 'COMMERCIAL_CONFIGURATION_NOT_FOUND'
    | 'COMMERCIAL_RULE_NOT_FOUND'
    | 'COMMERCIAL_RULE_CONFLICT'
    | 'RELATIONSHIP_CONFLICT',
  message: string,
  statusCode: number,
) => new AppError({ code, message, statusCode });
const decimal = (value: { toString(): string } | null) =>
  value?.toString() ?? null;
const audit = (actor: AuthContext, request: RequestMetadata) => ({
  actorId: actor.user.id,
  ipAddress: request.ipAddress ?? null,
  userAgent: request.userAgent?.slice(0, 2048) ?? null,
});

const configurationDto = (row: {
  id: string;
  organizationName: string;
  currency: string;
  roundingMode: 'HALF_UP' | 'UP' | 'DOWN';
  proposalValidityDays: number;
  ruleVersionPrefix: string;
  requiredDisclaimer: string;
  active: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}): CommercialConfiguration => ({
  ...row,
  currency: 'BRL',
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

type RuleRecord = Awaited<
  ReturnType<CommercialConfigurationsService['findRule']>
>;
function ruleDto(row: NonNullable<RuleRecord>): ProductCommercialRule {
  return {
    id: row.id,
    administradoraId: row.administradoraId,
    administratorName: row.administradora.nome,
    produtoId: row.produtoId,
    productName: row.produto?.nome ?? null,
    category: row.category as ProductCommercialRule['category'],
    name: row.name,
    version: row.version,
    active: row.active,
    validFrom: row.validFrom.toISOString(),
    validUntil: row.validUntil?.toISOString() ?? null,
    administrationFeePercent: decimal(row.administrationFeePercent),
    administrationFeeAmount: decimal(row.administrationFeeAmount),
    reserveFundPercent: decimal(row.reserveFundPercent),
    insurancePercent: decimal(row.insurancePercent),
    insuranceAmount: decimal(row.insuranceAmount),
    adhesionFeePercent: decimal(row.adhesionFeePercent),
    adhesionFeeAmount: decimal(row.adhesionFeeAmount),
    maxEmbeddedBidPercent: decimal(row.maxEmbeddedBidPercent),
    embeddedBidBasis: row.embeddedBidBasis,
    minimumTermMonths: row.minimumTermMonths,
    maximumTermMonths: row.maximumTermMonths,
    reducedInstallmentPercent: decimal(row.reducedInstallmentPercent),
    reducedUntilContemplation: row.reducedUntilContemplation,
    diluteReducedInstallments: row.diluteReducedInstallments,
    categoryValueCreditRatio: decimal(row.categoryValueCreditRatio),
    bidType: row.bidType,
    ownBidMaxPercent: decimal(row.ownBidMaxPercent),
    inProgressAllowed: row.inProgressAllowed,
    structuredOperationEligible: row.structuredOperationEligible,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function validateRule(input: CreateProductCommercialRuleRequest) {
  if (
    input.minimumTermMonths !== null &&
    input.minimumTermMonths !== undefined &&
    input.maximumTermMonths !== null &&
    input.maximumTermMonths !== undefined &&
    input.minimumTermMonths > input.maximumTermMonths
  )
    throw fail(
      'COMMERCIAL_RULE_CONFLICT',
      'Prazo mínimo não pode superar o máximo',
      409,
    );
  if (
    input.validUntil &&
    new Date(input.validUntil) < new Date(input.validFrom)
  )
    throw fail(
      'COMMERCIAL_RULE_CONFLICT',
      'Fim de vigência anterior ao início',
      409,
    );
  for (const [percent, amount, label] of [
    [
      input.administrationFeePercent,
      input.administrationFeeAmount,
      'taxa de administração',
    ],
    [input.insurancePercent, input.insuranceAmount, 'seguro'],
    [input.adhesionFeePercent, input.adhesionFeeAmount, 'taxa de adesão'],
  ] as const)
    if (
      percent !== null &&
      percent !== undefined &&
      amount !== null &&
      amount !== undefined
    )
      throw fail(
        'COMMERCIAL_RULE_CONFLICT',
        `Configure ${label} por percentual ou valor, não ambos`,
        409,
      );
}

function ruleCreateData(
  input: CreateProductCommercialRuleRequest,
  version: number,
  active = true,
): Prisma.ProductCommercialRuleUncheckedCreateInput {
  return {
    administradoraId: input.administradoraId,
    produtoId: input.produtoId ?? null,
    category: input.category,
    name: input.name,
    version,
    active,
    validFrom: new Date(input.validFrom),
    validUntil: input.validUntil ? new Date(input.validUntil) : null,
    administrationFeePercent: input.administrationFeePercent ?? null,
    administrationFeeAmount: input.administrationFeeAmount ?? null,
    reserveFundPercent: input.reserveFundPercent ?? null,
    insurancePercent: input.insurancePercent ?? null,
    insuranceAmount: input.insuranceAmount ?? null,
    adhesionFeePercent: input.adhesionFeePercent ?? null,
    adhesionFeeAmount: input.adhesionFeeAmount ?? null,
    maxEmbeddedBidPercent: input.maxEmbeddedBidPercent ?? null,
    embeddedBidBasis: input.embeddedBidBasis,
    minimumTermMonths: input.minimumTermMonths ?? null,
    maximumTermMonths: input.maximumTermMonths ?? null,
    reducedInstallmentPercent: input.reducedInstallmentPercent ?? null,
    reducedUntilContemplation: input.reducedUntilContemplation,
    diluteReducedInstallments: input.diluteReducedInstallments,
    categoryValueCreditRatio: input.categoryValueCreditRatio ?? null,
    bidType: input.bidType,
    ownBidMaxPercent: input.ownBidMaxPercent ?? null,
    inProgressAllowed: input.inProgressAllowed,
    structuredOperationEligible: input.structuredOperationEligible,
    notes: input.notes ?? null,
  };
}

export class CommercialConfigurationsService {
  constructor(private readonly db: PrismaClient) {}

  async getConfiguration() {
    const row = await this.db.commercialConfiguration.findFirst({
      where: { active: true },
      orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
    });
    if (!row)
      throw fail(
        'COMMERCIAL_CONFIGURATION_NOT_FOUND',
        'Configuração comercial ativa não encontrada',
        404,
      );
    return configurationDto(row);
  }

  async updateConfiguration(
    actor: AuthContext,
    input: UpdateCommercialConfigurationRequest,
    request: RequestMetadata,
  ) {
    const current = await this.db.commercialConfiguration.findFirst({
      where: { active: true },
      orderBy: { version: 'desc' },
    });
    if (!current)
      throw fail(
        'COMMERCIAL_CONFIGURATION_NOT_FOUND',
        'Configuração comercial não encontrada',
        404,
      );
    const updated = await this.db.$transaction(async (tx) => {
      const row = await tx.commercialConfiguration.update({
        where: { id: current.id },
        data: {
          ...(input.organizationName !== undefined
            ? { organizationName: input.organizationName }
            : {}),
          ...(input.roundingMode !== undefined
            ? { roundingMode: input.roundingMode }
            : {}),
          ...(input.proposalValidityDays !== undefined
            ? { proposalValidityDays: input.proposalValidityDays }
            : {}),
          ...(input.ruleVersionPrefix !== undefined
            ? { ruleVersionPrefix: input.ruleVersionPrefix }
            : {}),
          ...(input.requiredDisclaimer !== undefined
            ? { requiredDisclaimer: input.requiredDisclaimer }
            : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          version: { increment: 1 },
        },
      });
      await tx.auditLog.create({
        data: {
          ...audit(actor, request),
          action: 'COMMERCIAL_CONFIGURATION_UPDATED',
          entity: 'CommercialConfiguration',
          entityId: row.id,
          metadata: { previousVersion: current.version, version: row.version },
        },
      });
      return row;
    });
    return configurationDto(updated);
  }

  findRule(id: string) {
    return this.db.productCommercialRule.findFirst({
      where: { id, deletedAt: null },
      include: {
        administradora: { select: { nome: true } },
        produto: { select: { nome: true } },
      },
    });
  }

  async listRules(query: ProductCommercialRuleListQuery) {
    const where = {
      deletedAt: null,
      ...(query.category ? { category: query.category } : {}),
      ...(query.administradoraId
        ? { administradoraId: query.administradoraId }
        : {}),
      ...(query.produtoId ? { produtoId: query.produtoId } : {}),
      ...(query.active !== undefined ? { active: query.active } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.productCommercialRule.findMany({
        where,
        include: {
          administradora: { select: { nome: true } },
          produto: { select: { nome: true } },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.productCommercialRule.count({ where }),
    ]);
    return {
      items: rows.map(ruleDto),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total ? Math.ceil(total / query.pageSize) : 0,
    };
  }

  async getRule(id: string) {
    const row = await this.findRule(id);
    if (!row)
      throw fail(
        'COMMERCIAL_RULE_NOT_FOUND',
        'Regra comercial não encontrada',
        404,
      );
    return ruleDto(row);
  }

  private async verifyRelations(input: CreateProductCommercialRuleRequest) {
    const administrator = await this.db.administradora.findUnique({
      where: { id: input.administradoraId },
    });
    if (!administrator)
      throw fail('RELATIONSHIP_CONFLICT', 'Administradora não encontrada', 409);
    if (input.produtoId) {
      const product = await this.db.produto.findUnique({
        where: { id: input.produtoId },
      });
      if (
        !product ||
        product.administradoraId !== input.administradoraId ||
        product.categoria !== input.category
      )
        throw fail(
          'RELATIONSHIP_CONFLICT',
          'Produto incompatível com administradora ou categoria',
          409,
        );
    }
  }

  async createRule(
    actor: AuthContext,
    input: CreateProductCommercialRuleRequest,
    request: RequestMetadata,
  ) {
    validateRule(input);
    await this.verifyRelations(input);
    const latest = await this.db.productCommercialRule.findFirst({
      where: {
        administradoraId: input.administradoraId,
        produtoId: input.produtoId ?? null,
        category: input.category,
      },
      orderBy: { version: 'desc' },
    });
    const created = await this.db.$transaction(async (tx) => {
      await tx.productCommercialRule.updateMany({
        where: {
          administradoraId: input.administradoraId,
          produtoId: input.produtoId ?? null,
          category: input.category,
          active: true,
          deletedAt: null,
        },
        data: { active: false },
      });
      const row = await tx.productCommercialRule.create({
        data: ruleCreateData(input, (latest?.version ?? 0) + 1),
      });
      await tx.auditLog.create({
        data: {
          ...audit(actor, request),
          action: 'COMMERCIAL_RULE_CREATED',
          entity: 'ProductCommercialRule',
          entityId: row.id,
          metadata: { version: row.version },
        },
      });
      return row;
    });
    return this.getRule(created.id);
  }

  async updateRule(
    actor: AuthContext,
    id: string,
    patch: UpdateProductCommercialRuleRequest,
    request: RequestMetadata,
  ) {
    const current = await this.findRule(id);
    if (!current)
      throw fail(
        'COMMERCIAL_RULE_NOT_FOUND',
        'Regra comercial não encontrada',
        404,
      );
    const merged: CreateProductCommercialRuleRequest = {
      administradoraId: patch.administradoraId ?? current.administradoraId,
      produtoId:
        (patch.produtoId === undefined ? current.produtoId : patch.produtoId) ??
        null,
      category:
        patch.category ??
        (current.category as CreateProductCommercialRuleRequest['category']),
      name: patch.name ?? current.name,
      validFrom: patch.validFrom ?? current.validFrom.toISOString(),
      validUntil:
        patch.validUntil === undefined
          ? (current.validUntil?.toISOString() ?? null)
          : patch.validUntil,
      administrationFeePercent:
        patch.administrationFeePercent === undefined
          ? decimal(current.administrationFeePercent)
          : patch.administrationFeePercent,
      administrationFeeAmount:
        patch.administrationFeeAmount === undefined
          ? decimal(current.administrationFeeAmount)
          : patch.administrationFeeAmount,
      reserveFundPercent:
        patch.reserveFundPercent === undefined
          ? decimal(current.reserveFundPercent)
          : patch.reserveFundPercent,
      insurancePercent:
        patch.insurancePercent === undefined
          ? decimal(current.insurancePercent)
          : patch.insurancePercent,
      insuranceAmount:
        patch.insuranceAmount === undefined
          ? decimal(current.insuranceAmount)
          : patch.insuranceAmount,
      adhesionFeePercent:
        patch.adhesionFeePercent === undefined
          ? decimal(current.adhesionFeePercent)
          : patch.adhesionFeePercent,
      adhesionFeeAmount:
        patch.adhesionFeeAmount === undefined
          ? decimal(current.adhesionFeeAmount)
          : patch.adhesionFeeAmount,
      maxEmbeddedBidPercent:
        patch.maxEmbeddedBidPercent === undefined
          ? decimal(current.maxEmbeddedBidPercent)
          : patch.maxEmbeddedBidPercent,
      embeddedBidBasis:
        patch.embeddedBidBasis ?? current.embeddedBidBasis,
      minimumTermMonths:
        patch.minimumTermMonths === undefined
          ? current.minimumTermMonths
          : patch.minimumTermMonths,
      maximumTermMonths:
        patch.maximumTermMonths === undefined
          ? current.maximumTermMonths
          : patch.maximumTermMonths,
      reducedInstallmentPercent:
        patch.reducedInstallmentPercent === undefined
          ? decimal(current.reducedInstallmentPercent)
          : patch.reducedInstallmentPercent,
      reducedUntilContemplation:
        patch.reducedUntilContemplation ?? current.reducedUntilContemplation,
      diluteReducedInstallments:
        patch.diluteReducedInstallments ?? current.diluteReducedInstallments,
      categoryValueCreditRatio:
        patch.categoryValueCreditRatio === undefined
          ? decimal(current.categoryValueCreditRatio)
          : patch.categoryValueCreditRatio,
      bidType: patch.bidType ?? current.bidType,
      ownBidMaxPercent:
        patch.ownBidMaxPercent === undefined
          ? decimal(current.ownBidMaxPercent)
          : patch.ownBidMaxPercent,
      inProgressAllowed: patch.inProgressAllowed ?? current.inProgressAllowed,
      structuredOperationEligible:
        patch.structuredOperationEligible ??
        current.structuredOperationEligible,
      notes: patch.notes === undefined ? current.notes : patch.notes,
    };
    validateRule(merged);
    await this.verifyRelations(merged);
    const created = await this.db.$transaction(async (tx) => {
      await tx.productCommercialRule.update({
        where: { id },
        data: { active: false },
      });
      const row = await tx.productCommercialRule.create({
        data: ruleCreateData(merged, current.version + 1, patch.active ?? true),
      });
      await tx.auditLog.create({
        data: {
          ...audit(actor, request),
          action: 'COMMERCIAL_RULE_VERSIONED',
          entity: 'ProductCommercialRule',
          entityId: row.id,
          metadata: { previousRuleId: id, version: row.version },
        },
      });
      return row;
    });
    return this.getRule(created.id);
  }

  async deleteRule(actor: AuthContext, id: string, request: RequestMetadata) {
    const current = await this.findRule(id);
    if (!current)
      throw fail(
        'COMMERCIAL_RULE_NOT_FOUND',
        'Regra comercial não encontrada',
        404,
      );
    await this.db.$transaction([
      this.db.productCommercialRule.update({
        where: { id },
        data: { active: false, deletedAt: new Date() },
      }),
      this.db.auditLog.create({
        data: {
          ...audit(actor, request),
          action: 'COMMERCIAL_RULE_DELETED',
          entity: 'ProductCommercialRule',
          entityId: id,
        },
      }),
    ]);
  }
}
