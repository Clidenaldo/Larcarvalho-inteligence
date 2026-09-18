import { randomUUID } from 'node:crypto';

import {
  proposalSchema,
  type CreateProposalRequest,
  type CreateProposalVersionRequest,
  type Proposal,
  type ProposalListQuery,
  type UpdateProposalRequest,
  type UpdateProposalStatusRequest,
} from '@larcarvalho/shared';
import type { AuthContext } from '../../core/auth/auth-context.js';
import { commercialScope, dataScope, leadScope, requireAccess } from '../../core/auth/data-scope.js';
import { hasPermission } from '../../core/auth/rbac.js';
import { AppError } from '../../core/errors/app-error.js';
import type {
  Prisma,
  PrismaClient,
  ProposalStatus,
} from '../../generated/prisma/client.js';
import type { RequestMetadata } from '../identity/identity.service.js';
import type { CommercialConfigurationsService } from '../commercial-configurations/commercial-configurations.service.js';
import type { SimulationsService } from '../simulations/simulations.service.js';
import { ProposalPdfService } from './proposal-pdf.service.js';
import {
  ProposalsRepository,
  type ProposalRecord,
} from './proposals.repository.js';

const fail = (
  code:
    | 'PROPOSAL_NOT_FOUND'
    | 'PROPOSAL_CONFLICT'
    | 'LEAD_NOT_FOUND'
    | 'VALIDATION_ERROR',
  message: string,
  statusCode: number,
) => new AppError({ code, message, statusCode });
const audit = (actor: AuthContext, request: RequestMetadata) => ({
  actorId: actor.user.id,
  ipAddress: request.ipAddress ?? null,
  userAgent: request.userAgent?.slice(0, 2048) ?? null,
});
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

function proposalDto(row: ProposalRecord): Proposal {
  return proposalSchema.parse({
    id: row.id,
    number: row.number,
    parentId: row.parentId,
    simulationId: row.simulationId,
    createdById: row.createdById,
    sellerName: row.createdBy.nome,
    leadId: row.leadId,
    clientName: row.lead.nome,
    status: row.status,
    title: row.title,
    objectiveSummary: row.objectiveSummary,
    notes: row.notes,
    version: row.version,
    issuedAt: row.issuedAt?.toISOString() ?? null,
    validUntil: row.validUntil.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    items: row.items.map((item) => ({
      id: item.id,
      resultId: item.simulationResultId,
      position: item.position,
      description: item.description,
      financialSnapshot: item.financialSnapshot,
    })),
    statusHistory: row.statusHistory.map((history) => ({
      id: history.id,
      fromStatus: history.fromStatus,
      toStatus: history.toStatus,
      changedById: history.changedById,
      reason: history.reason,
      createdAt: history.createdAt.toISOString(),
    })),
  });
}

const transitions: Readonly<Record<ProposalStatus, readonly ProposalStatus[]>> =
  {
    DRAFT: ['GENERATED', 'CANCELLED'],
    GENERATED: ['SENT', 'CANCELLED'],
    SENT: ['VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
    VIEWED: ['ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
    ACCEPTED: [],
    REJECTED: [],
    EXPIRED: [],
    CANCELLED: [],
  };

export class ProposalsService {
  private readonly repository: ProposalsRepository;
  private readonly pdf = new ProposalPdfService();

  constructor(
    private readonly db: PrismaClient,
    private readonly simulations: SimulationsService,
    private readonly configurations: CommercialConfigurationsService,
  ) {
    this.repository = new ProposalsRepository(db);
  }

  private canReadAll(actor: AuthContext) {
    return hasPermission(actor, 'proposals.read_all');
  }

  private async accessible(actor: AuthContext, id: string, action: 'read' | 'update' = 'read') {
    const scope = dataScope(actor, 'proposals', action);
    const row = await this.repository.findById(id, { AND: [commercialScope(actor, 'proposals'), commercialScope(actor, 'proposals', action)] });
    if (!row) throw fail('PROPOSAL_NOT_FOUND', 'Proposta não encontrada', 404);
    if (
      scope === 'OWN' &&
      row.createdById !== actor.user.id &&
      row.lead.responsavelId !== actor.user.id
    )
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Acesso não autorizado',
        statusCode: 403,
      });
    return row;
  }

  async list(actor: AuthContext, query: ProposalListQuery) {
    const accessConditions: Prisma.ProposalWhereInput[] = [commercialScope(actor, 'proposals')];
    if (query.search) {
      accessConditions.push({
        OR: [
          { number: { contains: query.search, mode: 'insensitive' } },
          {
            lead: { nome: { contains: query.search, mode: 'insensitive' } },
          },
          {
            lead: {
              telefoneNormalizado: {
                contains: query.search.replace(/\D/g, ''),
              },
            },
          },
          {
            lead: {
              emailNormalizado: { contains: query.search, mode: 'insensitive' },
            },
          },
        ],
      });
    }
    const where: Prisma.ProposalWhereInput = {
      deletedAt: null,
      ...(accessConditions.length ? { AND: accessConditions } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { simulation: { category: query.category } } : {}),
      ...(query.leadId ? { leadId: query.leadId } : {}),
      ...(query.createdById && this.canReadAll(actor)
        ? { createdById: query.createdById }
        : {}),
      ...(query.administratorId
        ? {
            items: {
              some: {
                financialSnapshot: {
                  path: ['administratorId'],
                  equals: query.administratorId,
                },
              },
            },
          }
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
      items: rows.map(proposalDto),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total ? Math.ceil(total / query.pageSize) : 0,
    };
  }

  async get(actor: AuthContext, id: string) {
    return proposalDto(await this.accessible(actor, id));
  }

  async create(
    actor: AuthContext,
    simulationId: string,
    input: CreateProposalRequest,
    request: RequestMetadata,
  ) {
    requireAccess(actor, 'proposals.create');
    dataScope(actor, 'proposals');
    const simulation = await this.simulations.get(actor, simulationId);
    const lead = await this.db.lead.findFirst({ where: { id: input.leadId, AND: [leadScope(actor)] } });
    if (!lead) throw fail('LEAD_NOT_FOUND', 'Lead não encontrado', 404);

    const results = (simulation.scenarios ?? [])
      .flatMap((scenario) => scenario.results)
      .filter((result) => input.resultIds.includes(result.id));
    if (results.length !== new Set(input.resultIds).size)
      throw fail(
        'PROPOSAL_CONFLICT',
        'Um ou mais resultados não pertencem à simulação',
        409,
      );
    if (results.some((result) => result.calculationStatus !== 'COMPLETE'))
      throw fail(
        'PROPOSAL_CONFLICT',
        'Somente resultados completos podem compor proposta',
        409,
      );
    const configuration = await this.configurations.getConfiguration();
    const validUntil = new Date();
    validUntil.setUTCDate(
      validUntil.getUTCDate() + configuration.proposalValidityDays,
    );
    const number = `PROP-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const created = await this.db.$transaction(async (tx) => {
      const proposal = await tx.proposal.create({
        data: {
          number,
          simulationId,
          createdById: actor.user.id,
          leadId: input.leadId,
          title: input.title,
          objectiveSummary: input.objectiveSummary,
          notes: input.notes ?? null,
          validUntil,
          snapshot: json({ simulation, configuration, results }),
          items: {
            create: results.map((result, index) => {
              const { id: resultId, ...financialSnapshot } = result;
              return {
                simulationResultId: resultId,
                position: index + 1,
                description: `${result.administratorName} - ${result.productName ?? result.category}`,
                financialSnapshot: json(financialSnapshot),
              };
            }),
          },
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: 'DRAFT',
              changedById: actor.user.id,
            },
          },
        },
      });
      await tx.auditLog.create({
        data: {
          ...audit(actor, request),
          action: 'PROPOSAL_CREATED',
          entity: 'Proposal',
          entityId: proposal.id,
          metadata: { number, simulationId, itemCount: results.length },
        },
      });
      return proposal;
    });
    return this.get(actor, created.id);
  }

  /**
   * Editável somente enquanto rascunho nunca apresentado e sem versões
   * derivadas. Depois disso, alterações exigem nova versão (histórico
   * imutável das versões apresentadas/enviadas).
   */
  private async isEditable(id: string): Promise<boolean> {
    const row = await this.db.proposal.findUnique({
      where: { id },
      select: { issuedAt: true, status: true },
    });
    if (!row || row.status !== 'DRAFT' || row.issuedAt) return false;
    const children = await this.db.proposal.count({ where: { parentId: id } });
    return children === 0;
  }

  async update(
    actor: AuthContext,
    id: string,
    input: UpdateProposalRequest,
    request: RequestMetadata,
  ) {
    const current = await this.accessible(actor, id, 'update');
    if (!(await this.isEditable(id)))
      throw fail(
        'PROPOSAL_CONFLICT',
        'Proposta já apresentada: crie uma nova versão para alterar',
        409,
      );
    const { expectedUpdatedAt, ...values } = input;
    await this.db.$transaction(async (tx) => {
      const result = await tx.proposal.updateMany({
        where: {
          id,
          ...(expectedUpdatedAt ? { updatedAt: new Date(expectedUpdatedAt) } : {}),
        },
        data: {
          ...(values.title !== undefined ? { title: values.title.trim() } : {}),
          ...(values.objectiveSummary !== undefined
            ? { objectiveSummary: values.objectiveSummary.trim() }
            : {}),
          ...(values.notes !== undefined
            ? { notes: values.notes?.trim() || null }
            : {}),
        },
      });
      if (!result.count)
        throw fail('PROPOSAL_CONFLICT', 'A proposta foi alterada por outra pessoa', 409);
      await tx.auditLog.create({
        data: {
          ...audit(actor, request),
          action: 'PROPOSAL_UPDATED',
          entity: 'Proposal',
          entityId: id,
          metadata: { campos: Object.keys(values), version: current.version },
        },
      });
    });
    return this.get(actor, id);
  }

  async createVersion(
    actor: AuthContext,
    id: string,
    input: CreateProposalVersionRequest,
    request: RequestMetadata,
  ) {
    const source = await this.accessible(actor, id, 'update');
    if (await this.isEditable(id))
      throw fail(
        'PROPOSAL_CONFLICT',
        'Proposta ainda editável: altere o rascunho em vez de versionar',
        409,
      );
    const existingChildren = await this.db.proposal.count({ where: { parentId: id } });
    if (existingChildren > 0)
      throw fail(
        'PROPOSAL_CONFLICT',
        'Já existe uma versão criada a partir desta proposta',
        409,
      );
    const configuration = await this.configurations.getConfiguration();
    const validUntil = new Date();
    validUntil.setUTCDate(validUntil.getUTCDate() + configuration.proposalValidityDays);
    const number = `PROP-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const sourceItems = await this.db.proposalItem.findMany({
      where: { proposalId: id },
      orderBy: { position: 'asc' },
    });
    const created = await this.db.$transaction(async (tx) => {
      const proposal = await tx.proposal.create({
        data: {
          number,
          parentId: id,
          simulationId: source.simulationId,
          createdById: actor.user.id,
          leadId: source.leadId,
          title: input.title?.trim() ?? source.title,
          objectiveSummary: input.objectiveSummary?.trim() ?? source.objectiveSummary,
          notes: input.notes !== undefined ? input.notes?.trim() || null : source.notes,
          validUntil,
          version: source.version + 1,
          snapshot: json(source.snapshot),
          items: {
            create: sourceItems.map((item) => ({
              simulationResultId: item.simulationResultId,
              position: item.position,
              description: item.description,
              financialSnapshot: json(item.financialSnapshot),
            })),
          },
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: 'DRAFT',
              changedById: actor.user.id,
              reason: `Nova versão a partir de ${source.number} v${source.version}`,
            },
          },
        },
      });
      await tx.auditLog.create({
        data: {
          ...audit(actor, request),
          action: 'PROPOSAL_VERSION_CREATED',
          entity: 'Proposal',
          entityId: proposal.id,
          metadata: { parentId: id, parentNumber: source.number, version: source.version + 1 },
        },
      });
      return proposal;
    });
    return this.get(actor, created.id);
  }

  async versions(actor: AuthContext, id: string) {
    const current = await this.accessible(actor, id);
    let rootId: string | null = current.id;
    const seen = new Set<string>();
    while (rootId && !seen.has(rootId)) {
      seen.add(rootId);
      const parent: { parentId: string | null } | null = await this.db.proposal.findUnique({
        where: { id: rootId },
        select: { parentId: true },
      });
      if (!parent?.parentId) break;
      await this.accessible(actor, parent.parentId);
      rootId = parent.parentId;
    }
    if (!rootId) throw fail('PROPOSAL_NOT_FOUND', 'Proposta não encontrada', 404);
    const chain: { createdAt: Date; id: string; number: string; status: ProposalStatus; version: number }[] = [];
    let cursor: string | null = rootId;
    const visited = new Set<string>();
    while (cursor && !visited.has(cursor)) {
      visited.add(cursor);
      const row = await this.db.proposal.findUnique({
        where: { id: cursor },
        select: { createdAt: true, id: true, number: true, status: true, version: true },
      });
      if (!row) break;
      chain.push(row);
      const child: { id: string } | null = await this.db.proposal.findFirst({
        where: { parentId: cursor },
        select: { id: true },
        orderBy: { version: 'asc' },
      });
      cursor = child?.id ?? null;
    }
    return {
      currentId: id,
      items: chain.map((item) => ({
        createdAt: item.createdAt.toISOString(),
        id: item.id,
        number: item.number,
        status: item.status,
        version: item.version,
      })),
      rootId,
    };
  }

  async changeStatus(
    actor: AuthContext,
    id: string,
    input: UpdateProposalStatusRequest,
    request: RequestMetadata,
  ) {
    const current = await this.accessible(actor, id, 'update');
    if (!transitions[current.status].includes(input.status))
      throw fail(
        'PROPOSAL_CONFLICT',
        `Transição ${current.status} -> ${input.status} não permitida`,
        409,
      );
    await this.db.$transaction([
      this.db.proposal.update({
        where: { id },
        data: {
          status: input.status,
          ...(input.status === 'GENERATED' && !current.issuedAt
            ? { issuedAt: new Date() }
            : {}),
        },
      }),
      this.db.proposalStatusHistory.create({
        data: {
          proposalId: id,
          fromStatus: current.status,
          toStatus: input.status,
          changedById: actor.user.id,
          reason: input.reason ?? null,
        },
      }),
      this.db.auditLog.create({
        data: {
          ...audit(actor, request),
          action: 'PROPOSAL_STATUS_CHANGED',
          entity: 'Proposal',
          entityId: id,
          metadata: { from: current.status, to: input.status },
        },
      }),
    ]);
    return this.get(actor, id);
  }

  async generatePdf(
    actor: AuthContext,
    id: string,
    request: RequestMetadata,
    options: { readonly detail?: 'full' | 'summary' } = {},
  ) {
    requireAccess(actor, 'proposals.export');
    const current = await this.accessible(actor, id);
    const proposal = proposalDto(current);
    const configuration = await this.configurations.getConfiguration();
    const detail = options.detail ?? 'full';
    const bytes = await this.pdf.generate(proposal, configuration, {
      detail,
    });
    const updates = [];
    if (current.status === 'DRAFT') {
      updates.push(
        this.db.proposal.update({
          where: { id },
          data: { status: 'GENERATED', issuedAt: new Date() },
        }),
        this.db.proposalStatusHistory.create({
          data: {
            proposalId: id,
            fromStatus: 'DRAFT',
            toStatus: 'GENERATED',
            changedById: actor.user.id,
            reason: 'PDF gerado',
          },
        }),
      );
    }
    updates.push(
      this.db.auditLog.create({
        data: {
          ...audit(actor, request),
          action: 'PROPOSAL_PDF_EXPORTED',
          entity: 'Proposal',
          entityId: id,
          metadata: { bytes: bytes.length, version: current.version, detail },
        },
      }),
    );
    await this.db.$transaction(updates);
    return { bytes, filename: `${current.number}.pdf` };
  }

  async registerPrint(
    actor: AuthContext,
    id: string,
    request: RequestMetadata,
  ) {
    requireAccess(actor, 'proposals.export');
    await this.accessible(actor, id);
    await this.db.auditLog.create({
      data: {
        ...audit(actor, request),
        action: 'PROPOSAL_PRINTED',
        entity: 'Proposal',
        entityId: id,
      },
    });
  }

  async delete(actor: AuthContext, id: string, request: RequestMetadata) {
    await this.accessible(actor, id, 'update');
    await this.db.$transaction([
      this.db.proposal.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'CANCELLED' },
      }),
      this.db.auditLog.create({
        data: {
          ...audit(actor, request),
          action: 'PROPOSAL_DELETED',
          entity: 'Proposal',
          entityId: id,
        },
      }),
    ]);
  }
}
