import { randomUUID } from 'node:crypto';

import type {
  CalculateSimulationRequest,
  CreateSimulationRequest,
  Simulation,
  SimulationListQuery,
  SimulationResult,
  SimulationResultBadge,
  UpdateSimulationRequest,
} from '@larcarvalho/shared';
import type { AuthContext } from '../../core/auth/auth-context.js';
import { commercialScope, dataScope, leadScope, requireAccess } from '../../core/auth/data-scope.js';
import { hasPermission } from '../../core/auth/rbac.js';
import { AppError } from '../../core/errors/app-error.js';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import type { RequestMetadata } from '../identity/identity.service.js';
import {
  SimulationCalculatorService,
  simulationEngineVersion,
  type CalculationRule,
} from './services/simulation-calculator.service.js';
import {
  SimulationsRepository,
  type SimulationRecord,
} from './simulations.repository.js';

const jsonIds = (value: Prisma.JsonValue | null): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
const decimal = (value: { toString(): string } | null) =>
  value?.toString() ?? null;
const snapshotJson = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const metadata = (actor: AuthContext, request: RequestMetadata) => ({
  actorId: actor.user.id,
  ipAddress: request.ipAddress ?? null,
  userAgent: request.userAgent?.slice(0, 2048) ?? null,
});
const fail = (
  code: 'SIMULATION_NOT_FOUND' | 'SIMULATION_CONFLICT' | 'LEAD_NOT_FOUND',
  message: string,
  statusCode: number,
) => new AppError({ code, message, statusCode });

function resultDto(
  row: SimulationRecord['scenarios'][number]['results'][number],
): SimulationResult {
  return {
    id: row.id,
    badges: [],
    calculationStatus: row.calculationStatus,
    calculationWarnings: Array.isArray(row.calculationWarnings)
      ? row.calculationWarnings.filter(
          (item): item is string => typeof item === 'string',
        )
      : [],
    ruleVersion: row.ruleVersion,
    sourceDataUpdatedAt: row.sourceDataUpdatedAt.toISOString(),
    administratorId: row.administradoraId,
    administratorName: row.administratorName,
    productId: row.produtoId,
    productName: row.productName,
    groupId: row.grupoId,
    groupCode: row.groupCode,
    quotaId: row.cotaId,
    quotaNumber: row.quotaNumber,
    category: row.category as SimulationResult['category'],
    contractedCredit: decimal(row.contractedCredit),
    netCredit: decimal(row.netCredit),
    totalTermMonths: row.totalTermMonths,
    remainingTermMonths: row.remainingTermMonths,
    initialInstallment: decimal(row.initialInstallment),
    reducedInstallment: decimal(row.reducedInstallment),
    laterInstallment: decimal(row.laterInstallment),
    ownBidAmount: decimal(row.ownBidAmount),
    embeddedBidAmount: decimal(row.embeddedBidAmount),
    totalBidAmount: decimal(row.totalBidAmount),
    totalBidPercent: decimal(row.totalBidPercent),
    administrationFee: decimal(row.administrationFee),
    reserveFund: decimal(row.reserveFund),
    insurance: decimal(row.insurance),
    adhesionFee: decimal(row.adhesionFee),
    adherenceScore: row.adherenceScore,
    assumptions: Array.isArray(row.assumptions)
      ? row.assumptions.filter(
          (item): item is string => typeof item === 'string',
        )
      : [],
  };
}

function withResultBadges(results: SimulationResult[]): SimulationResult[] {
  const complete = results.filter(
    (result) => result.calculationStatus === 'COMPLETE',
  );
  const metric = (
    value: string | number | null | undefined,
    fallback: number,
  ) => (value === null || value === undefined ? fallback : Number(value));
  const minimum = (
    selector: (result: SimulationResult) => string | number | null | undefined,
  ) =>
    Math.min(...complete.map((result) => metric(selector(result), Infinity)));
  const maximum = (
    selector: (result: SimulationResult) => string | number | null | undefined,
  ) =>
    Math.max(...complete.map((result) => metric(selector(result), -Infinity)));
  const lowestInstallment = minimum((result) => result.initialInstallment);
  const highestNetCredit = maximum((result) => result.netCredit);
  const shortestTerm = minimum((result) => result.remainingTermMonths);
  const bestAdherence = maximum((result) => result.adherenceScore);

  return results.map((result) => {
    const badges: SimulationResultBadge[] = [];
    if (result.calculationStatus === 'INCOMPLETE_DATA') {
      badges.push('PENDING_DATA');
    }
    if (result.calculationStatus === 'INELIGIBLE') {
      badges.push('INELIGIBLE');
    }
    if (result.calculationStatus === 'COMPLETE') {
      if (metric(result.initialInstallment, Infinity) === lowestInstallment) {
        badges.push('LOWEST_INSTALLMENT');
      }
      if (metric(result.netCredit, -Infinity) === highestNetCredit) {
        badges.push('HIGHEST_NET_CREDIT');
      }
      if (metric(result.remainingTermMonths, Infinity) === shortestTerm) {
        badges.push('SHORTEST_TERM');
      }
      if (metric(result.adherenceScore, -Infinity) === bestAdherence) {
        badges.push('BEST_ADHERENCE');
      }
    }
    return { ...result, badges };
  });
}

export function simulationDto(
  row: SimulationRecord,
  actorId: string,
): Simulation {
  return {
    id: row.id,
    number: row.number,
    createdById: row.createdById,
    createdByName: row.createdBy.nome,
    leadId: row.leadId,
    leadName: row.lead?.nome ?? null,
    category: row.category as Simulation['category'],
    creditMode: row.creditMode,
    requestedCredit: row.requestedCredit.toString(),
    desiredTermMonths: row.desiredTermMonths,
    ownBidAmount: row.ownBidAmount.toString(),
    embeddedBidPercent: row.embeddedBidPercent.toString(),
    paidInstallments: row.paidInstallments,
    structuredOperation: row.structuredOperation,
    administratorIds: jsonIds(row.selectedAdministratorIds),
    productIds: jsonIds(row.selectedProductIds),
    groupIds: jsonIds(row.selectedGroupIds),
    quotaIds: jsonIds(row.selectedQuotaIds),
    status: row.status,
    notes: row.notes,
    favorite: row.favorites.some((favorite) => favorite.userId === actorId),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    scenarios: row.scenarios.map((scenario) => ({
      id: scenario.id,
      name: scenario.name,
      sort: scenario.sortOrder as NonNullable<
        Simulation['scenarios']
      >[number]['sort'],
      pinned: scenario.pinned,
      calculatedAt: scenario.snapshots[0]?.calculatedAt.toISOString() ?? null,
      engineVersion: scenario.snapshots[0]?.engineVersion ?? null,
      results: withResultBadges(scenario.results.map((result) => {
        const snapshot = scenario.snapshots.find((item) => item.id === result.calculationSnapshotId);
        const object = (value: Prisma.JsonValue | undefined): Prisma.JsonObject =>
          value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        const input = object(snapshot?.inputSnapshot);
        const rules = snapshot?.ruleSnapshots;
        const rule = object(Array.isArray(rules) ? rules.find((item) => object(item).id === result.commercialRuleId) : undefined);
        const text = (value: Prisma.JsonValue | undefined) => typeof value === 'string' ? value : null;
        const boolean = (value: Prisma.JsonValue | undefined) => typeof value === 'boolean' ? value : null;
        return { ...resultDto(result), comparisonContext: {
          paidInstallments: typeof input.paidInstallments === 'number' ? input.paidInstallments : null,
          administrationFeePercent: text(rule.administrationFeePercent),
          maxEmbeddedBidPercent: text(rule.maxEmbeddedBidPercent),
          diluteReducedInstallments: boolean(rule.diluteReducedInstallments),
          reducedUntilContemplation: boolean(rule.reducedUntilContemplation),
          includeInsurance: boolean(input.includeInsurance),
        } };
      })),
    })),
  };
}

export class SimulationsService {
  private readonly repository: SimulationsRepository;
  private readonly calculator = new SimulationCalculatorService();

  constructor(private readonly db: PrismaClient) {
    this.repository = new SimulationsRepository(db);
  }

  private canReadAll(actor: AuthContext) {
    return hasPermission(actor, 'simulations.read_all');
  }

  async catalog(actor: AuthContext) {
    requireAccess(actor, 'simulations.create');
    const product = { id: true, nome: true, categoria: true } as const;
    const group = { id: true, codigo: true, produto: { select: product } } as const;
    const [administrators, products, groups, quotas] = await Promise.all([
      this.db.administradora.findMany({ where: { ativa: true }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
      this.db.produto.findMany({ where: { ativo: true }, select: product, orderBy: { nome: 'asc' } }),
      this.db.grupo.findMany({ where: { status: 'ATIVO' }, select: group, orderBy: { codigo: 'asc' } }),
      this.db.cota.findMany({ where: { status: 'ATIVO' }, select: { id: true, numero: true, grupo: { select: group } }, orderBy: { numero: 'asc' } }),
    ]);
    return { administrators, products, groups, quotas };
  }

  private async accessible(actor: AuthContext, id: string, action: 'read' | 'update' | 'delete' = 'read') {
    const scope = dataScope(actor, 'simulations', action);
    const row = await this.repository.findById(id, { AND: [commercialScope(actor, 'simulations'), commercialScope(actor, 'simulations', action)] });
    if (!row)
      throw fail('SIMULATION_NOT_FOUND', 'Simulação não encontrada', 404);
    if (
      scope === 'OWN' &&
      row.createdById !== actor.user.id &&
      row.lead?.responsavelId !== actor.user.id
    )
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Acesso não autorizado',
        statusCode: 403,
      });
    return row;
  }

  async list(actor: AuthContext, query: SimulationListQuery) {
    const ownership = commercialScope(actor, 'simulations');
    const where: Prisma.SimulationWhereInput = {
      deletedAt: null,
      AND: [ownership],
      ...(query.category ? { category: query.category } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.leadId ? { leadId: query.leadId } : {}),
      ...(query.createdById && this.canReadAll(actor)
        ? { createdById: query.createdById }
        : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await this.repository.list(
      where,
      query.page,
      query.pageSize,
    );
    return {
      items: rows.map((row) => simulationDto(row, actor.user.id)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total ? Math.ceil(total / query.pageSize) : 0,
    };
  }

  async get(actor: AuthContext, id: string) {
    return simulationDto(await this.accessible(actor, id), actor.user.id);
  }

  private async verifyLead(actor: AuthContext, leadId: string | undefined) {
    if (!leadId) return;
    const lead = await this.db.lead.findFirst({ where: { id: leadId, AND: [leadScope(actor)] } });
    if (!lead) throw fail('LEAD_NOT_FOUND', 'Lead não encontrado', 404);

  }

  async create(
    actor: AuthContext,
    input: CreateSimulationRequest,
    request: RequestMetadata,
  ) {
    requireAccess(actor, 'simulations.create');
    dataScope(actor, 'simulations');
    await this.verifyLead(actor, input.leadId);
    const number = `SIM-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const created = await this.db.$transaction(async (tx) => {
      const simulation = await tx.simulation.create({
        data: {
          number,
          createdById: actor.user.id,
          leadId: input.leadId ?? null,
          category: input.category,
          creditMode: input.creditMode,
          requestedCredit: input.requestedCredit,
          desiredTermMonths: input.desiredTermMonths,
          ownBidAmount: input.ownBidAmount,
          embeddedBidPercent: input.embeddedBidPercent,
          paidInstallments: input.paidInstallments,
          structuredOperation: input.structuredOperation,
          selectedAdministratorIds: input.administratorIds,
          selectedProductIds: input.productIds,
          selectedGroupIds: input.groupIds,
          selectedQuotaIds: input.quotaIds,
          notes: input.notes ?? null,
        },
      });
      await tx.auditLog.create({
        data: {
          ...metadata(actor, request),
          action: 'SIMULATION_CREATED',
          entity: 'Simulation',
          entityId: simulation.id,
          metadata: { number, category: input.category },
        },
      });
      return simulation;
    });
    return this.get(actor, created.id);
  }

  async update(
    actor: AuthContext,
    id: string,
    input: UpdateSimulationRequest,
    request: RequestMetadata,
  ) {
    await this.accessible(actor, id, 'update');
    await this.verifyLead(actor, input.leadId);
    await this.db.$transaction([
      this.db.simulation.update({
        where: { id },
        data: {
          ...(input.leadId !== undefined ? { leadId: input.leadId } : {}),
          ...(input.category ? { category: input.category } : {}),
          ...(input.creditMode ? { creditMode: input.creditMode } : {}),
          ...(input.requestedCredit
            ? { requestedCredit: input.requestedCredit }
            : {}),
          ...(input.desiredTermMonths !== undefined
            ? { desiredTermMonths: input.desiredTermMonths }
            : {}),
          ...(input.ownBidAmount !== undefined
            ? { ownBidAmount: input.ownBidAmount }
            : {}),
          ...(input.embeddedBidPercent !== undefined
            ? { embeddedBidPercent: input.embeddedBidPercent }
            : {}),
          ...(input.paidInstallments !== undefined
            ? { paidInstallments: input.paidInstallments }
            : {}),
          ...(input.structuredOperation !== undefined
            ? { structuredOperation: input.structuredOperation }
            : {}),
          ...(input.administratorIds
            ? { selectedAdministratorIds: input.administratorIds }
            : {}),
          ...(input.productIds ? { selectedProductIds: input.productIds } : {}),
          ...(input.groupIds ? { selectedGroupIds: input.groupIds } : {}),
          ...(input.quotaIds ? { selectedQuotaIds: input.quotaIds } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        },
      }),
      this.db.auditLog.create({
        data: {
          ...metadata(actor, request),
          action: 'SIMULATION_UPDATED',
          entity: 'Simulation',
          entityId: id,
        },
      }),
    ]);
    return this.get(actor, id);
  }

  async delete(actor: AuthContext, id: string, request: RequestMetadata) {
    await this.accessible(actor, id, 'delete');
    await this.db.$transaction([
      this.db.simulation.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'ARCHIVED' },
      }),
      this.db.auditLog.create({
        data: {
          ...metadata(actor, request),
          action: 'SIMULATION_DELETED',
          entity: 'Simulation',
          entityId: id,
        },
      }),
    ]);
  }

  async calculate(
    actor: AuthContext,
    id: string,
    input: CalculateSimulationRequest,
    request: RequestMetadata,
  ) {
    const current = await this.accessible(actor, id, 'update');
    if (input.pin) {
      const pinned = await this.db.simulationScenario.count({
        where: { simulationId: id, pinned: true },
      });
      if (pinned >= 5)
        throw fail(
          'SIMULATION_CONFLICT',
          'É possível fixar no máximo cinco cenários',
          409,
        );
    }
    const config = await this.repository.activeConfiguration();
    if (!config)
      throw fail(
        'SIMULATION_CONFLICT',
        'Configuração comercial ativa não encontrada',
        409,
      );
    const criteria: CreateSimulationRequest = {
      category: current.category as CreateSimulationRequest['category'],
      creditMode: current.creditMode,
      requestedCredit: current.requestedCredit.toString(),
      desiredTermMonths: input.termMonths ?? current.desiredTermMonths,
      ownBidAmount: current.ownBidAmount.toString(),
      embeddedBidPercent: current.embeddedBidPercent.toString(),
      includeInsurance: input.includeInsurance,
      includeEmbeddedBid: input.includeEmbeddedBid,
      paidInstallments: current.paidInstallments,
      structuredOperation: current.structuredOperation,
      administratorIds: jsonIds(current.selectedAdministratorIds),
      productIds: jsonIds(current.selectedProductIds),
      groupIds: jsonIds(current.selectedGroupIds),
      quotaIds: jsonIds(current.selectedQuotaIds),
      notes: current.notes ?? undefined,
      sort: input.sort,
    };
    const rules = await this.repository.activeRules(criteria);
    if (!rules.length)
      throw fail(
        'SIMULATION_CONFLICT',
        'Nenhuma regra comercial vigente atende aos critérios',
        409,
      );
    const [selectedGroups, selectedQuotas] = await Promise.all([
      criteria.groupIds.length
        ? this.db.grupo.findMany({
            where: { id: { in: criteria.groupIds }, status: 'ATIVO' },
            include: { produto: { select: { categoria: true } } },
          })
        : [],
      criteria.quotaIds.length
        ? this.db.cota.findMany({
            where: { id: { in: criteria.quotaIds }, status: 'ATIVO' },
            include: {
              grupo: {
                include: { produto: { select: { categoria: true } } },
              },
            },
          })
        : [],
    ]);
    if (selectedGroups.length !== criteria.groupIds.length)
      throw fail(
        'SIMULATION_CONFLICT',
        'Um ou mais grupos selecionados não estão disponíveis',
        409,
      );
    if (selectedQuotas.length !== criteria.quotaIds.length)
      throw fail(
        'SIMULATION_CONFLICT',
        'Uma ou mais cotas selecionadas não estão disponíveis',
        409,
      );
    const contexts = selectedQuotas.length
      ? selectedQuotas.map((quota) => ({
          group: quota.grupo,
          quota,
          sourceUpdatedAt:
            quota.updatedAt > quota.grupo.updatedAt
              ? quota.updatedAt
              : quota.grupo.updatedAt,
        }))
      : selectedGroups.length
        ? selectedGroups.map((group) => ({
            group,
            quota: null,
            sourceUpdatedAt: group.updatedAt,
          }))
        : [{ group: null, quota: null, sourceUpdatedAt: null }];
    const calculated = rules.flatMap((row) => {
      const calculationRule: CalculationRule = {
        id: row.id,
        version: row.version,
        administratorId: row.administradoraId,
        administratorName: row.administradora.nome,
        productId: row.produtoId,
        productName: row.produto?.nome ?? null,
        category: row.category as CalculationRule['category'],
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
        updatedAt: row.updatedAt.toISOString(),
      };
      return contexts
        .filter(
          ({ group }) =>
            !group ||
            (group.administradoraId === row.administradoraId &&
              (!row.produtoId || group.produtoId === row.produtoId) &&
              group.produto?.categoria === criteria.category),
        )
        .map(({ group, quota, sourceUpdatedAt }) => {
          const result = this.calculator.calculate(criteria, calculationRule, {
            roundingMode: config.roundingMode,
            ruleVersionPrefix: config.ruleVersionPrefix,
            ...(group ? { group: { id: group.id, code: group.codigo } } : {}),
            ...(quota ? { quota: { id: quota.id, number: quota.numero } } : {}),
          });
          const latestSource =
            sourceUpdatedAt && sourceUpdatedAt > row.updatedAt
              ? sourceUpdatedAt
              : row.updatedAt;
          return { ...result, sourceDataUpdatedAt: latestSource.toISOString() };
        });
    });
    if (!calculated.length)
      throw fail(
        'SIMULATION_CONFLICT',
        'Nenhuma regra é compatível com os grupos ou cotas selecionados',
        409,
      );
    const sorters = {
      LOWEST_INSTALLMENT: (
        a: (typeof calculated)[number],
        b: (typeof calculated)[number],
      ) =>
        Number(a.initialInstallment ?? Number.MAX_SAFE_INTEGER) -
        Number(b.initialInstallment ?? Number.MAX_SAFE_INTEGER),
      HIGHEST_NET_CREDIT: (
        a: (typeof calculated)[number],
        b: (typeof calculated)[number],
      ) => Number(b.netCredit ?? -1) - Number(a.netCredit ?? -1),
      SHORTEST_TERM: (
        a: (typeof calculated)[number],
        b: (typeof calculated)[number],
      ) =>
        Number(a.remainingTermMonths ?? Number.MAX_SAFE_INTEGER) -
        Number(b.remainingTermMonths ?? Number.MAX_SAFE_INTEGER),
      ADHERENCE: (
        a: (typeof calculated)[number],
        b: (typeof calculated)[number],
      ) => Number(b.adherenceScore ?? -1) - Number(a.adherenceScore ?? -1),
    };
    calculated.sort(sorters[input.sort]);
    const scenario = await this.db.$transaction(async (tx) => {
      const createdScenario = await tx.simulationScenario.create({
        data: {
          simulationId: id,
          name: input.scenarioName,
          sortOrder: input.sort,
          pinned: input.pin,
          parameters: criteria,
        },
      });
      const snapshot = await tx.simulationCalculationSnapshot.create({
        data: {
          scenarioId: createdScenario.id,
          engineVersion: simulationEngineVersion,
          inputSnapshot: criteria,
          commercialConfigSnapshot: snapshotJson(config),
          ruleSnapshots: snapshotJson(rules),
          sourceDataSnapshot: snapshotJson(
            rules.map((rule) => ({
              ruleId: rule.id,
              administratorUpdatedAt: rule.administradora.updatedAt,
              productUpdatedAt: rule.produto?.updatedAt ?? null,
            })),
          ),
        },
      });
      for (const item of calculated) {
        await tx.simulationResult.create({
          data: {
            scenarioId: createdScenario.id,
            calculationSnapshotId: snapshot.id,
            commercialRuleId: item.commercialRuleId,
            administradoraId: item.administratorId,
            produtoId: item.productId,
            grupoId: item.groupId,
            cotaId: item.quotaId,
            groupCode: item.groupCode,
            quotaNumber: item.quotaNumber,
            calculationStatus: item.calculationStatus,
            calculationWarnings: item.calculationWarnings,
            ruleVersion: item.ruleVersion,
            sourceDataUpdatedAt: new Date(item.sourceDataUpdatedAt),
            administratorName: item.administratorName,
            productName: item.productName,
            category: item.category,
            contractedCredit: item.contractedCredit,
            netCredit: item.netCredit,
            totalTermMonths: item.totalTermMonths,
            remainingTermMonths: item.remainingTermMonths,
            initialInstallment: item.initialInstallment,
            reducedInstallment: item.reducedInstallment,
            laterInstallment: item.laterInstallment,
            ownBidAmount: item.ownBidAmount,
            embeddedBidAmount: item.embeddedBidAmount,
            totalBidAmount: item.totalBidAmount,
            totalBidPercent: item.totalBidPercent,
            administrationFee: item.administrationFee,
            reserveFund: item.reserveFund,
            insurance: item.insurance,
            adhesionFee: item.adhesionFee,
            adherenceScore: item.adherenceScore,
            assumptions: item.assumptions,
          },
        });
      }
      await tx.simulation.update({
        where: { id },
        data: { status: 'CALCULATED' },
      });
      await tx.auditLog.create({
        data: {
          ...metadata(actor, request),
          action: 'SIMULATION_CALCULATED',
          entity: 'Simulation',
          entityId: id,
          metadata: {
            scenarioId: createdScenario.id,
            resultCount: calculated.length,
            engineVersion: simulationEngineVersion,
          },
        },
      });
      return createdScenario;
    });
    return this.get(actor, current.id).then((simulation) =>
      simulation.scenarios?.find((item) => item.id === scenario.id),
    );
  }

  async favorite(actor: AuthContext, id: string, request: RequestMetadata) {
    await this.accessible(actor, id);
    const existing = await this.db.simulationFavorite.findFirst({
      where: { userId: actor.user.id, type: 'SIMULATION', simulationId: id },
    });
    if (!existing)
      await this.db.$transaction([
        this.db.simulationFavorite.create({
          data: { userId: actor.user.id, type: 'SIMULATION', simulationId: id },
        }),
        this.db.auditLog.create({
          data: {
            ...metadata(actor, request),
            action: 'SIMULATION_FAVORITED',
            entity: 'Simulation',
            entityId: id,
          },
        }),
      ]);
    return this.get(actor, id);
  }

  async registerPrint(
    actor: AuthContext,
    id: string,
    request: RequestMetadata,
  ) {
    await this.accessible(actor, id);
    await this.db.auditLog.create({
      data: {
        ...metadata(actor, request),
        action: 'SIMULATION_PRINTED',
        entity: 'Simulation',
        entityId: id,
      },
    });
  }

  async exportScenarioCsv(
    actor: AuthContext,
    id: string,
    scenarioId: string,
    request: RequestMetadata,
  ) {
    const simulation = await this.accessible(actor, id);
    const scenario = simulation.scenarios.find((item) => item.id === scenarioId);
    if (!scenario)
      throw fail('SIMULATION_NOT_FOUND', 'Cenário não encontrado', 404);
    const brl = (value: string | null) =>
      value === null
        ? 'Não informado'
        : new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          }).format(Number(value));
    const text = (value: string | null | undefined) =>
      value ? value : 'Não informado';
    const header = [
      'Administradora',
      'Produto/plano',
      'Categoria',
      'Grupo',
      'Cota',
      'Status do cálculo',
      'Crédito contratado',
      'Crédito líquido',
      'Prazo total (meses)',
      'Prazo restante (meses)',
      'Parcela inicial',
      'Parcela reduzida',
      'Parcela pós-contemplação',
      'Lance próprio',
      'Lance embutido',
      'Lance total',
      'Lance total (%)',
      'Taxa de administração',
      'Fundo de reserva',
      'Seguro',
      'Taxa de adesão',
      'Aderência (%)',
      'Versão da regra',
      'Fonte atualizada em',
      'Avisos e premissas',
    ];
    const escape = (value: string) =>
      /[";\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
    const statusLabel = {
      COMPLETE: 'Completo',
      INCOMPLETE_DATA: 'Dados incompletos',
      INELIGIBLE: 'Não elegível',
    } as const;
    const rows = scenario.results.map((result) => {
      const dto = resultDto(result);
      return [
        dto.administratorName,
        text(dto.productName),
        dto.category,
        text(dto.groupCode),
        text(dto.quotaNumber),
        statusLabel[dto.calculationStatus],
        brl(dto.contractedCredit),
        brl(dto.netCredit),
        dto.totalTermMonths?.toString() ?? 'Não informado',
        dto.remainingTermMonths?.toString() ?? 'Não informado',
        brl(dto.initialInstallment),
        brl(dto.reducedInstallment),
        brl(dto.laterInstallment),
        brl(dto.ownBidAmount),
        brl(dto.embeddedBidAmount),
        brl(dto.totalBidAmount),
        dto.totalBidPercent ? `${dto.totalBidPercent}%` : 'Não informado',
        brl(dto.administrationFee),
        brl(dto.reserveFund),
        brl(dto.insurance),
        brl(dto.adhesionFee),
        dto.adherenceScore === null
          ? 'Não informado'
          : `${dto.adherenceScore}%`,
        dto.ruleVersion,
        dto.sourceDataUpdatedAt,
        [...dto.calculationWarnings, ...dto.assumptions].join(' ') ||
          'Não informado',
      ];
    });
    const csv = `\ufeff${[header, ...rows]
      .map((row) => row.map(escape).join(';'))
      .join('\r\n')}\r\n`;
    const filename = `${simulation.number}-${scenario.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'cenario'}.csv`;
    await this.db.auditLog.create({
      data: {
        ...metadata(actor, request),
        action: 'SIMULATION_CSV_EXPORTED',
        entity: 'Simulation',
        entityId: id,
        metadata: { scenarioId, rowCount: rows.length },
      },
    });
    return { csv, filename };
  }

  async listCatalogFavorites(actor: AuthContext) {
    const favorites = await this.db.simulationFavorite.findMany({
      where: {
        userId: actor.user.id,
        type: { in: ['ADMINISTRATOR', 'PRODUCT'] },
      },
      select: { type: true, administradoraId: true, produtoId: true },
    });
    return {
      administratorIds: favorites.flatMap((item) =>
        item.type === 'ADMINISTRATOR' && item.administradoraId
          ? [item.administradoraId]
          : [],
      ),
      productIds: favorites.flatMap((item) =>
        item.type === 'PRODUCT' && item.produtoId ? [item.produtoId] : [],
      ),
    };
  }

  async favoriteCatalogEntity(
    actor: AuthContext,
    type: 'ADMINISTRATOR' | 'PRODUCT',
    entityId: string,
    request: RequestMetadata,
  ) {
    const exists =
      type === 'ADMINISTRATOR'
        ? await this.db.administradora.findUnique({ where: { id: entityId } })
        : await this.db.produto.findUnique({ where: { id: entityId } });
    if (!exists)
      throw new AppError({
        code: 'NOT_FOUND',
        message:
          type === 'ADMINISTRATOR'
            ? 'Administradora não encontrada'
            : 'Produto não encontrado',
        statusCode: 404,
      });
    const target =
      type === 'ADMINISTRATOR'
        ? { administradoraId: entityId }
        : { produtoId: entityId };
    const previous = await this.db.simulationFavorite.findFirst({
      where: { userId: actor.user.id, type, ...target },
    });
    if (!previous)
      await this.db.$transaction([
        this.db.simulationFavorite.create({
          data: { userId: actor.user.id, type, ...target },
        }),
        this.db.auditLog.create({
          data: {
            ...metadata(actor, request),
            action: 'SIMULATION_CATALOG_FAVORITED',
            entity: type === 'ADMINISTRATOR' ? 'Administradora' : 'Produto',
            entityId,
          },
        }),
      ]);
  }

  async unfavoriteCatalogEntity(
    actor: AuthContext,
    type: 'ADMINISTRATOR' | 'PRODUCT',
    entityId: string,
    request: RequestMetadata,
  ) {
    const target =
      type === 'ADMINISTRATOR'
        ? { administradoraId: entityId }
        : { produtoId: entityId };
    await this.db.$transaction([
      this.db.simulationFavorite.deleteMany({
        where: { userId: actor.user.id, type, ...target },
      }),
      this.db.auditLog.create({
        data: {
          ...metadata(actor, request),
          action: 'SIMULATION_CATALOG_UNFAVORITED',
          entity: type === 'ADMINISTRATOR' ? 'Administradora' : 'Produto',
          entityId,
        },
      }),
    ]);
  }

  async unfavorite(actor: AuthContext, id: string, request: RequestMetadata) {
    await this.accessible(actor, id);
    await this.db.$transaction([
      this.db.simulationFavorite.deleteMany({
        where: { userId: actor.user.id, type: 'SIMULATION', simulationId: id },
      }),
      this.db.auditLog.create({
        data: {
          ...metadata(actor, request),
          action: 'SIMULATION_UNFAVORITED',
          entity: 'Simulation',
          entityId: id,
        },
      }),
    ]);
    return this.get(actor, id);
  }
}
