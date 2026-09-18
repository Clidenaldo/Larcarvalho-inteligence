import type {
  AssignLeadRequest,
  ChangeLeadStatusRequest,
  CreateLeadInteractionRequest,
  CreateLeadInterestRequest,
  CreateLeadRequest,
  LeadListQuery,
  LeadStatus,
  PublicLeadRequest,
  SetLeadNextContactRequest,
  UpdateLeadRequest,
} from '@larcarvalho/shared';
import type { AuthContext } from '../../core/auth/auth-context.js';
import { leadScope, requireAccess, scopedUsers } from '../../core/auth/data-scope.js';
import { hasPermission } from '../../core/auth/rbac.js';
import { AppError } from '../../core/errors/app-error.js';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { getBusinessMetrics } from '../../infrastructure/observability/business-metrics.js';
import { fortalezaDayBounds, isLeadOverdue } from './lead-rules.js';

export const allowedLeadTransitions: Readonly<
  Record<LeadStatus, readonly LeadStatus[]>
> = {
  NOVO: ['EM_ATENDIMENTO', 'PERDIDO'],
  EM_ATENDIMENTO: ['CONTATO_REALIZADO', 'QUALIFICADO', 'PERDIDO'],
  CONTATO_REALIZADO: ['EM_ATENDIMENTO', 'QUALIFICADO', 'PERDIDO'],
  QUALIFICADO: ['EM_ATENDIMENTO', 'PROPOSTA', 'PERDIDO'],
  PROPOSTA: ['QUALIFICADO', 'NEGOCIACAO', 'PERDIDO'],
  NEGOCIACAO: ['PROPOSTA', 'CONVERTIDO', 'PERDIDO'],
  CONVERTIDO: [],
  PERDIDO: ['EM_ATENDIMENTO'],
};

const includeLead = {
  responsavel: { select: { id: true, nome: true, role: true } },
} satisfies Prisma.LeadInclude;
type LeadRow = Prisma.LeadGetPayload<{ include: typeof includeLead }>;
type ProfileInput = Partial<
  Pick<
    PublicLeadRequest,
    | 'categoriaInteresse'
    | 'valorCreditoDesejado'
    | 'parcelaMaxima'
    | 'prazoMinimo'
    | 'prazoMaximo'
    | 'lanceDisponivelPercentual'
  >
>;
type ProfileData = Pick<
  Prisma.LeadUncheckedCreateInput,
  | 'categoriaInteresse'
  | 'valorCreditoDesejado'
  | 'parcelaMaxima'
  | 'prazoMinimo'
  | 'prazoMaximo'
  | 'lanceDisponivelPercentual'
>;
const includeDetail = {
  ...includeLead,
  interesses: {
    include: { grupo: { include: { administradora: true } } },
    orderBy: [{ principal: 'desc' }, { createdAt: 'asc' }],
  },
  interacoes: {
    include: { criadoPor: { select: { id: true, nome: true, role: true } } },
    orderBy: [{ ocorridoEm: 'desc' }, { createdAt: 'desc' }],
  },
} satisfies Prisma.LeadInclude;
type LeadDetailRow = Prisma.LeadGetPayload<{ include: typeof includeDetail }>;

function asString(value: Prisma.Decimal | null) {
  return value?.toFixed() ?? null;
}
function asNumber(value: Prisma.Decimal | null) {
  return value?.toNumber() ?? null;
}
function mapLead(lead: LeadRow) {
  return {
    id: lead.id,
    nome: lead.nome,
    telefone: lead.telefoneNormalizado,
    email: lead.emailNormalizado,
    origem: lead.origem,
    status: lead.status,
    responsavel: lead.responsavel,
    categoriaInteresse: lead.categoriaInteresse,
    valorCreditoDesejado: asString(lead.valorCreditoDesejado),
    parcelaMaxima: asString(lead.parcelaMaxima),
    prazoMinimo: lead.prazoMinimo,
    prazoMaximo: lead.prazoMaximo,
    lanceDisponivelPercentual: asString(lead.lanceDisponivelPercentual),
    observacoes: lead.observacoes,
    objetivo: lead.objetivo,
    dataPretendidaAquisicao:
      lead.dataPretendidaAquisicao?.toISOString().slice(0, 10) ?? null,
    restricoes: lead.restricoes,
    proximoContatoEm: lead.proximoContatoEm?.toISOString() ?? null,
    convertidoEm: lead.convertidoEm?.toISOString() ?? null,
    motivoPerda: lead.motivoPerda,
    descricaoMotivoPerda: lead.descricaoMotivoPerda,
    consentimentoContatoEm: lead.consentimentoContatoEm?.toISOString() ?? null,
    versaoTextoConsentimento: lead.versaoTextoConsentimento,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
    atrasado: isLeadOverdue(lead),
  };
}
function mapDetail(lead: LeadDetailRow) {
  return {
    ...mapLead(lead),
    interesses: lead.interesses.map((item) => ({
      id: item.id,
      grupoId: item.grupoId,
      grupo: item.grupo.codigo,
      administradora: item.grupo.administradora.nome,
      indiceAderenciaCapturado: asNumber(item.indiceAderenciaCapturado),
      coberturaAvaliacaoCapturada: asNumber(item.coberturaAvaliacaoCapturada),
      capturadoEm: item.capturadoEm.toISOString(),
      principal: item.principal,
      createdAt: item.createdAt.toISOString(),
    })),
    interacoes: lead.interacoes.map((item) => ({
      id: item.id,
      tipo: item.tipo,
      descricao: item.descricao,
      criadoPor: item.criadoPor,
      ocorridoEm: item.ocorridoEm.toISOString(),
      createdAt: item.createdAt.toISOString(),
    })),
  };
}
function profileData(input: ProfileInput): Partial<ProfileData> {
  const data: Partial<ProfileData> = {};
  if (input.categoriaInteresse !== undefined)
    data.categoriaInteresse = input.categoriaInteresse;
  if (input.valorCreditoDesejado !== undefined)
    data.valorCreditoDesejado = input.valorCreditoDesejado;
  if (input.parcelaMaxima !== undefined)
    data.parcelaMaxima = input.parcelaMaxima;
  if (input.prazoMinimo !== undefined) data.prazoMinimo = input.prazoMinimo;
  if (input.prazoMaximo !== undefined) data.prazoMaximo = input.prazoMaximo;
  if (input.lanceDisponivelPercentual !== undefined)
    data.lanceDisponivelPercentual = input.lanceDisponivelPercentual;
  return data;
}

export class LeadsService {
  constructor(private readonly db: PrismaClient) {}

  private scope(context: AuthContext): Prisma.LeadWhereInput {
    return leadScope(context);
  }
  private async accessible(context: AuthContext, id: string) {
    const lead = await this.db.lead.findFirst({
      where: { id, ...this.scope(context) },
      include: includeDetail,
    });
    if (!lead)
      throw new AppError({
        code: 'LEAD_NOT_FOUND',
        message: 'Lead não encontrado',
        statusCode: 404,
      });
    return lead;
  }
  private async mutable(context: AuthContext, id: string) {
    const lead = await this.db.lead.findFirst({ where: { id, AND: [leadScope(context), leadScope(context, 'update')] }, include: includeDetail });
    if (!lead) throw new AppError({ code: 'LEAD_NOT_FOUND', message: 'Lead indisponivel', statusCode: 404 });
    return lead;
  }

  async capturePublic(input: PublicLeadRequest) {
    if (input.website) return;
    try {
      await this.db.$transaction(async (tx) => {
        const attribution = input.analyticsAnonymousId
          ? await tx.analyticsSession.findUnique({
              where: { anonymousId: input.analyticsAnonymousId },
            })
          : null;
        const contacts: Prisma.LeadWhereInput[] = [];
        if (input.telefone)
          contacts.push({ telefoneNormalizado: input.telefone });
        if (input.email) contacts.push({ emailNormalizado: input.email });
        const matches = await tx.lead.findMany({
          where: { OR: contacts },
          select: { id: true },
        });
        const deterministic =
          new Set(matches.map((item) => item.id)).size === 1
            ? matches[0]
            : undefined;
        const now = new Date();
        const attributionData = attribution
          ? {
              analyticsSessionId: attribution.id,
              utmSource: attribution.utmSource,
              utmMedium: attribution.utmMedium,
              utmCampaign: attribution.utmCampaign,
              utmContent: attribution.utmContent,
              utmTerm: attribution.utmTerm,
              referrerHost: attribution.referrerHost,
            }
          : {};
        const lead =
          deterministic ??
          (await tx.lead.create({
            data: {
              nome: input.nome,
              telefoneNormalizado: input.telefone ?? null,
              emailNormalizado: input.email ?? null,
              origem: 'SIMULADOR_PUBLICO',
              ...profileData(input),
              consentimentoContatoEm: now,
              versaoTextoConsentimento: input.versaoTextoConsentimento,
              ...attributionData,
            },
            select: { id: true },
          }));
        if (!deterministic) {
          await tx.auditLog.create({
            data: {
              action: 'LEAD_CREATED',
              entity: 'Lead',
              entityId: lead.id,
              metadata: { origem: 'SIMULADOR_PUBLICO' },
            },
          });
          getBusinessMetrics().recordLead('created');
        }
        if (input.interesse) {
          const group = await tx.grupo.findFirst({
            where: {
              codigo: input.interesse.grupo,
              status: 'ATIVO',
              administradora: {
                nome: input.interesse.administradora,
                ativa: true,
              },
              produto: { ativo: true },
            },
            select: { id: true },
          });
          if (group) {
            const count = await tx.leadInteresse.count({
              where: { leadId: lead.id },
            });
            await tx.leadInteresse.upsert({
              where: { leadId_grupoId: { leadId: lead.id, grupoId: group.id } },
              create: {
                leadId: lead.id,
                grupoId: group.id,
                principal: count === 0,
                indiceAderenciaCapturado:
                  input.interesse.indiceAderenciaCapturado,
                coberturaAvaliacaoCapturada:
                  input.interesse.coberturaAvaliacaoCapturada,
                capturadoEm: now,
              },
              update: {
                indiceAderenciaCapturado:
                  input.interesse.indiceAderenciaCapturado,
                coberturaAvaliacaoCapturada:
                  input.interesse.coberturaAvaliacaoCapturada,
                capturadoEm: now,
              },
            });
          }
        }
        await tx.leadInteracao.create({
          data: {
            leadId: lead.id,
            tipo: 'NOTA',
            descricao: 'Nova solicitação recebida pelo simulador público.',
            ocorridoEm: now,
          },
        });
        await tx.auditLog.create({
          data: {
            action: 'LEAD_INTERACTION_CREATED',
            entity: 'Lead',
            entityId: lead.id,
            metadata: { tipo: 'NOTA', origem: 'SIMULADOR_PUBLICO' },
          },
        });
      });
      if (input.analyticsAnonymousId) {
        void this.db.analyticsSession
          .findUnique({
            where: { anonymousId: input.analyticsAnonymousId },
            select: { id: true },
          })
          .then(
            (session) =>
              session
                ? this.db.analyticsEvent.create({
                    data: {
                      sessionId: session.id,
                      type: 'LEAD_CREATED',
                      path: '/simulador',
                      category: input.categoriaInteresse ?? null,
                    },
                  })
                : undefined,
            () => undefined,
          )
          .then(undefined, () => undefined);
      }
    } catch (error) {
      if (input.analyticsAnonymousId) {
        void this.db.analyticsSession
          .findUnique({
            where: { anonymousId: input.analyticsAnonymousId },
            select: { id: true },
          })
          .then(
            (session) =>
              session
                ? this.db.analyticsEvent.create({
                    data: {
                      sessionId: session.id,
                      type: 'LEAD_CREATION_FAILED',
                      path: '/simulador',
                      category: input.categoriaInteresse ?? null,
                    },
                  })
                : undefined,
            () => undefined,
          )
          .then(undefined, () => undefined);
      }
      throw error;
    }
  }

  async list(context: AuthContext, query: LeadListQuery) {
    const where: Prisma.LeadWhereInput = { AND: [this.scope(context)] };
    if (query.status) where.status = query.status;
    if (query.responsavelId) where.responsavelId = query.responsavelId;
    if (query.origem) where.origem = query.origem;
    if (query.categoria) where.categoriaInteresse = query.categoria;
    if (query.semResponsavel !== undefined)
      where.responsavelId = query.semResponsavel ? null : { not: null };
    if (query.criadoDe || query.criadoAte)
      where.createdAt = {
        ...(query.criadoDe ? { gte: new Date(query.criadoDe) } : {}),
        ...(query.criadoAte ? { lte: new Date(query.criadoAte) } : {}),
      };
    const now = new Date();
    const today = fortalezaDayBounds(now);
    if (query.proximoContato === 'ATRASADO')
      Object.assign(where, {
        proximoContatoEm: { lt: now },
        status: { notIn: ['CONVERTIDO', 'PERDIDO'] },
      });
    if (query.proximoContato === 'HOJE')
      Object.assign(where, {
        proximoContatoEm: { gte: today.start, lt: today.end },
        status: { notIn: ['CONVERTIDO', 'PERDIDO'] },
      });
    if (query.proximoContato === 'FUTURO')
      Object.assign(where, {
        proximoContatoEm: { gte: today.end },
        status: { notIn: ['CONVERTIDO', 'PERDIDO'] },
      });
    if (query.busca) {
      const digits = query.busca.replace(/\D/g, '');
      where.OR = [
        { nome: { contains: query.busca, mode: 'insensitive' } },
        {
          emailNormalizado: {
            contains: query.busca.toLowerCase(),
            mode: 'insensitive',
          },
        },
        ...(digits ? [{ telefoneNormalizado: { contains: digits } }] : []),
      ];
    }
    const orderBy: Record<
      LeadListQuery['sort'],
      Prisma.LeadOrderByWithRelationInput
    > = {
      maisRecentes: { createdAt: 'desc' },
      maisAntigos: { createdAt: 'asc' },
      proximoContato: { proximoContatoEm: { sort: 'asc', nulls: 'last' } },
      nome: { nome: 'asc' },
      status: { status: 'asc' },
    };
    const scope = this.scope(context);
    const active = { notIn: ['CONVERTIDO', 'PERDIDO'] as LeadStatus[] };
    const [items, total, groups, semResponsavel, atrasados] =
      await this.db.$transaction([
        this.db.lead.findMany({
          where,
          include: includeLead,
          orderBy: [orderBy[query.sort], { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.db.lead.count({ where }),
        this.db.lead.groupBy({
          by: ['status'],
          where: scope,
          orderBy: { status: 'asc' },
          _count: { _all: true },
        }),
        this.db.lead.count({ where: { AND: [scope, { responsavelId: null }] } }),
        this.db.lead.count({
          where: { ...scope, proximoContatoEm: { lt: now }, status: active },
        }),
      ]);
    const summary: Record<LeadStatus, number> & {
      semResponsavel: number;
      atrasados: number;
    } = {
      NOVO: 0,
      EM_ATENDIMENTO: 0,
      CONTATO_REALIZADO: 0,
      QUALIFICADO: 0,
      PROPOSTA: 0,
      NEGOCIACAO: 0,
      CONVERTIDO: 0,
      PERDIDO: 0,
      semResponsavel: 0,
      atrasados: 0,
    };
    for (const group of groups)
      summary[group.status] =
        typeof group._count === 'object' && group._count
          ? (group._count._all ?? 0)
          : 0;
    summary.semResponsavel = semResponsavel;
    summary.atrasados = atrasados;
    return {
      items: items.map(mapLead),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total ? Math.ceil(total / query.pageSize) : 0,
      summary,
    };
  }

  async get(context: AuthContext, id: string) {
    return mapDetail(await this.accessible(context, id));
  }

  async create(context: AuthContext, input: CreateLeadRequest) {
    requireAccess(context, 'leads.create');
    leadScope(context);
    const contacts: Prisma.LeadWhereInput[] = [];
    if (input.telefone) contacts.push({ telefoneNormalizado: input.telefone });
    if (input.email) contacts.push({ emailNormalizado: input.email });
    if (await this.db.lead.count({ where: { OR: contacts } }))
      throw new AppError({
        code: 'LEAD_CONFLICT',
        message: 'Já existe um lead com esse contato',
        statusCode: 409,
      });
    const responsibleId =
      hasPermission(context, 'leads.read_all') ? null : context.user.id;
    const lead = await this.db.$transaction(async (tx) => {
      const created = await tx.lead.create({
        data: {
          nome: input.nome,
          telefoneNormalizado: input.telefone ?? null,
          emailNormalizado: input.email ?? null,
          origem: 'CADASTRO_MANUAL',
          responsavelId: responsibleId,
          ...profileData(input),
          ...(input.observacoes !== undefined
            ? { observacoes: input.observacoes }
            : {}),
          ...(input.proximoContatoEm
            ? { proximoContatoEm: new Date(input.proximoContatoEm) }
            : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: context.user.id,
          action: 'LEAD_CREATED',
          entity: 'Lead',
          entityId: created.id,
          metadata: { origem: 'CADASTRO_MANUAL' },
        },
      });
      getBusinessMetrics().recordLead('created');
      return created;
    });
    return this.get(context, lead.id);
  }

  async update(context: AuthContext, id: string, input: UpdateLeadRequest) {
    const current = await this.mutable(context, id);
    const { expectedUpdatedAt, ...values } = input;
    const data: Prisma.LeadUpdateManyMutationInput = {
      ...profileData(values),
      ...(values.nome !== undefined ? { nome: values.nome } : {}),
      ...(values.telefone !== undefined
        ? { telefoneNormalizado: values.telefone }
        : {}),
      ...(values.email !== undefined ? { emailNormalizado: values.email } : {}),
      ...(values.observacoes !== undefined
        ? { observacoes: values.observacoes }
        : {}),
      ...(values.objetivo !== undefined ? { objetivo: values.objetivo } : {}),
      ...(values.dataPretendidaAquisicao !== undefined
        ? {
            dataPretendidaAquisicao: values.dataPretendidaAquisicao
              ? new Date(values.dataPretendidaAquisicao)
              : null,
          }
        : {}),
      ...(values.restricoes !== undefined
        ? { restricoes: values.restricoes }
        : {}),
    };
    const finalPhone =
      data.telefoneNormalizado === undefined
        ? current.telefoneNormalizado
        : data.telefoneNormalizado;
    const finalEmail =
      data.emailNormalizado === undefined
        ? current.emailNormalizado
        : data.emailNormalizado;
    if (!finalPhone && !finalEmail)
      throw new AppError({
        code: 'LEAD_CONFLICT',
        message: 'O lead precisa de um meio de contato',
        statusCode: 409,
      });
    await this.db.$transaction(async (tx) => {
      const result = await tx.lead.updateMany({
        where: {
          id,
          ...(expectedUpdatedAt
            ? { updatedAt: new Date(expectedUpdatedAt) }
            : {}),
        },
        data,
      });
      if (!result.count)
        throw new AppError({
          code: 'LEAD_CONFLICT',
          message: 'O lead foi alterado por outra pessoa',
          statusCode: 409,
        });
      await tx.auditLog.create({
        data: {
          actorId: context.user.id,
          action: 'LEAD_CONTACT_UPDATED',
          entity: 'Lead',
          entityId: id,
          metadata: { campos: Object.keys(data) },
        },
      });
    });
    return this.get(context, id);
  }

  async assign(context: AuthContext, id: string, input: AssignLeadRequest) {
    if (!hasPermission(context, 'leads.assign'))
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Acesso não autorizado',
        statusCode: 403,
      });
    await this.accessible(context, id);
    if (!input.responsavelId && !hasPermission(context, 'leads.read_all')) throw new AppError({ code: 'FORBIDDEN', message: 'Responsavel obrigatorio neste escopo', statusCode: 403 });
    if (input.responsavelId) {
      const user = await this.db.user.findFirst({
        where: {
          AND: [hasPermission(context, 'leads.read_all') ? {} : scopedUsers(context)],
          id: input.responsavelId,
          ativo: true,
          role: { in: ['VENDEDOR', 'GESTOR', 'ADMIN', 'SUPER_ADMIN'] },
        },
      });
      if (!user)
        throw new AppError({
          code: 'LEAD_CONFLICT',
          message: 'Responsável inválido',
          statusCode: 409,
        });
    }
    await this.db.$transaction(async (tx) => {
      const result = await tx.lead.updateMany({
        where: {
          id,
          ...(input.expectedUpdatedAt
            ? { updatedAt: new Date(input.expectedUpdatedAt) }
            : {}),
        },
        data: { responsavelId: input.responsavelId },
      });
      if (!result.count)
        throw new AppError({
          code: 'LEAD_CONFLICT',
          message: 'O lead foi alterado por outra pessoa',
          statusCode: 409,
        });
      await tx.auditLog.create({
        data: {
          actorId: context.user.id,
          action: 'LEAD_ASSIGNED',
          entity: 'Lead',
          entityId: id,
          metadata: { responsavelId: input.responsavelId },
        },
      });
    });
    return this.get(context, id);
  }

  async changeStatus(
    context: AuthContext,
    id: string,
    input: ChangeLeadStatusRequest,
  ) {
    const current = await this.mutable(context, id);
    requireAccess(context, 'leads.change_status');
    const from = current.status as LeadStatus;
    if (!allowedLeadTransitions[from].includes(input.status))
      throw new AppError({
        code: 'LEAD_CONFLICT',
        message: 'Transição de status não permitida',
        statusCode: 409,
      });
    const reopened = from === 'PERDIDO';
    const now = new Date();
    await this.db.$transaction(async (tx) => {
      const result = await tx.lead.updateMany({
        where: {
          id,
          ...(input.expectedUpdatedAt
            ? { updatedAt: new Date(input.expectedUpdatedAt) }
            : {}),
        },
        data: {
          status: input.status,
          motivoPerda:
            input.status === 'PERDIDO' ? (input.motivoPerda ?? null) : null,
          descricaoMotivoPerda:
            input.status === 'PERDIDO'
              ? (input.descricaoMotivoPerda ?? null)
              : null,
          convertidoEm: input.status === 'CONVERTIDO' ? now : null,
        },
      });
      if (!result.count)
        throw new AppError({
          code: 'LEAD_CONFLICT',
          message: 'O lead foi alterado por outra pessoa',
          statusCode: 409,
        });
      await tx.leadInteracao.create({
        data: {
          leadId: id,
          tipo: 'STATUS',
          criadoPorId: context.user.id,
          descricao: `Status alterado de ${from} para ${input.status}${input.observacao ? `: ${input.observacao}` : ''}`,
          ocorridoEm: now,
        },
      });
      const action = reopened
        ? 'LEAD_REOPENED'
        : input.status === 'CONVERTIDO'
          ? 'LEAD_CONVERTED'
          : input.status === 'PERDIDO'
            ? 'LEAD_LOST'
            : 'LEAD_STATUS_CHANGED';
      await tx.auditLog.create({
        data: {
          actorId: context.user.id,
          action,
          entity: 'Lead',
          entityId: id,
          metadata: {
            de: from,
            para: input.status,
            motivoPerda: input.motivoPerda,
          },
        },
      });
      if (input.status === 'CONVERTIDO') {
        getBusinessMetrics().recordLead('converted');
      } else if (input.status === 'PERDIDO' && !reopened) {
        getBusinessMetrics().recordLead('lost');
      }
      if (input.status === 'CONVERTIDO' && input.grupoId) {
        const group = await tx.grupo.findUnique({
          where: { id: input.grupoId },
          select: { id: true },
        });
        if (!group)
          throw new AppError({
            code: 'GRUPO_NOT_FOUND',
            message: 'Grupo não encontrado',
            statusCode: 404,
          });
        const count = await tx.leadInteresse.count({ where: { leadId: id } });
        await tx.leadInteresse.upsert({
          where: { leadId_grupoId: { leadId: id, grupoId: input.grupoId } },
          create: {
            leadId: id,
            grupoId: input.grupoId,
            principal: count === 0,
          },
          update: {},
        });
      }
    });
    return this.get(context, id);
  }

  async interact(
    context: AuthContext,
    id: string,
    input: CreateLeadInteractionRequest,
  ) {
    requireAccess(context, 'leads.add_interaction');
    await this.mutable(context, id);
    await this.db.$transaction(async (tx) => {
      await tx.leadInteracao.create({
        data: {
          leadId: id,
          criadoPorId: context.user.id,
          tipo: input.tipo,
          descricao: input.descricao,
          ...(input.ocorridoEm
            ? { ocorridoEm: new Date(input.ocorridoEm) }
            : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: context.user.id,
          action: 'LEAD_INTERACTION_CREATED',
          entity: 'Lead',
          entityId: id,
          metadata: { tipo: input.tipo },
        },
      });
    });
    return this.get(context, id);
  }
  async nextContact(
    context: AuthContext,
    id: string,
    input: SetLeadNextContactRequest,
  ) {
    await this.mutable(context, id);
    await this.db.$transaction(async (tx) => {
      const result = await tx.lead.updateMany({
        where: {
          id,
          ...(input.expectedUpdatedAt
            ? { updatedAt: new Date(input.expectedUpdatedAt) }
            : {}),
        },
        data: {
          proximoContatoEm: input.proximoContatoEm
            ? new Date(input.proximoContatoEm)
            : null,
        },
      });
      if (!result.count)
        throw new AppError({
          code: 'LEAD_CONFLICT',
          message: 'O lead foi alterado por outra pessoa',
          statusCode: 409,
        });
      await tx.auditLog.create({
        data: {
          actorId: context.user.id,
          action: 'LEAD_NEXT_CONTACT_CHANGED',
          entity: 'Lead',
          entityId: id,
          metadata: { definido: Boolean(input.proximoContatoEm) },
        },
      });
    });
    return this.get(context, id);
  }
  async addInterest(
    context: AuthContext,
    id: string,
    input: CreateLeadInterestRequest,
  ) {
    await this.mutable(context, id);
    await this.db.$transaction(async (tx) => {
      const group = await tx.grupo.findUnique({ where: { id: input.grupoId } });
      if (!group)
        throw new AppError({
          code: 'GRUPO_NOT_FOUND',
          message: 'Grupo não encontrado',
          statusCode: 404,
        });
      if (input.principal)
        await tx.leadInteresse.updateMany({
          where: { leadId: id, principal: true },
          data: { principal: false },
        });
      const count = await tx.leadInteresse.count({ where: { leadId: id } });
      await tx.leadInteresse.create({
        data: {
          leadId: id,
          grupoId: input.grupoId,
          ...(input.indiceAderenciaCapturado !== undefined
            ? { indiceAderenciaCapturado: input.indiceAderenciaCapturado }
            : {}),
          ...(input.coberturaAvaliacaoCapturada !== undefined
            ? {
                coberturaAvaliacaoCapturada: input.coberturaAvaliacaoCapturada,
              }
            : {}),
          principal: input.principal || count === 0,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: context.user.id,
          action: 'LEAD_INTEREST_ADDED',
          entity: 'Lead',
          entityId: id,
          metadata: { grupoId: input.grupoId },
        },
      });
    });
    return this.get(context, id);
  }
  async removeInterest(context: AuthContext, id: string, interestId: string) {
    await this.mutable(context, id);
    await this.db.$transaction(async (tx) => {
      const interest = await tx.leadInteresse.findFirst({
        where: { id: interestId, leadId: id },
      });
      if (!interest)
        throw new AppError({
          code: 'LEAD_NOT_FOUND',
          message: 'Interesse não encontrado',
          statusCode: 404,
        });
      await tx.leadInteresse.delete({ where: { id: interestId } });
      if (interest.principal) {
        const next = await tx.leadInteresse.findFirst({
          where: { leadId: id },
          orderBy: { createdAt: 'asc' },
        });
        if (next)
          await tx.leadInteresse.update({
            where: { id: next.id },
            data: { principal: true },
          });
      }
      await tx.auditLog.create({
        data: {
          actorId: context.user.id,
          action: 'LEAD_INTEREST_REMOVED',
          entity: 'Lead',
          entityId: id,
          metadata: { grupoId: interest.grupoId },
        },
      });
    });
    return this.get(context, id);
  }
}
