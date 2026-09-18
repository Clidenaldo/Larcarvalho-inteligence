import type {
  Administradora,
  AdministradoraListQuery,
  AdministradoraListResponse,
  CreateAdministradoraRequest,
  Permission,
  UpdateAdministradoraRequest,
} from '@larcarvalho/shared';

import type { AuthContext } from '../../core/auth/auth-context.js';
import { hasPermission } from '../../core/auth/rbac.js';
import { AppError } from '../../core/errors/app-error.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { RequestMetadata } from '../identity/identity.service.js';
import {
  AdministradorasRepository,
  type AdministradoraRecord,
} from './administradoras.repository.js';

function dto(record: AdministradoraRecord): Administradora {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function notFound(): AppError {
  return new AppError({
    code: 'ADMINISTRADORA_NOT_FOUND',
    message: 'Administradora não encontrada',
    statusCode: 404,
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

function conflict(): AppError {
  return new AppError({
    code: 'ADMINISTRADORA_CONFLICT',
    message: 'Já existe uma administradora com este CNPJ',
    statusCode: 409,
  });
}

function auditMetadata(metadata: RequestMetadata) {
  return {
    ipAddress: metadata.ipAddress ?? null,
    userAgent: metadata.userAgent?.slice(0, 2048) ?? null,
  };
}

function summary(value: AdministradoraRecord) {
  return {
    ativa: value.ativa,
    cnpj: value.cnpj,
    codigoExterno: value.codigoExterno,
    nome: value.nome,
    nomeFantasia: value.nomeFantasia,
    site: value.site,
  };
}

export class AdministradorasService {
  private readonly repository: AdministradorasRepository;

  constructor(private readonly prisma: PrismaClient) {
    this.repository = new AdministradorasRepository(prisma);
  }

  private assert(actor: AuthContext, permission: Permission): void {
    if (!hasPermission(actor, permission)) {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Acesso não autorizado',
        statusCode: 403,
      });
    }
  }

  async list(
    actor: AuthContext,
    query: AdministradoraListQuery,
  ): Promise<AdministradoraListResponse> {
    this.assert(actor, 'administradoras.read');
    const { items, total } = await this.repository.list(query);
    return {
      items: items.map(dto),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    };
  }

  async get(actor: AuthContext, id: string): Promise<Administradora> {
    this.assert(actor, 'administradoras.read');
    const record = await this.repository.findById(id);
    if (!record) throw notFound();
    return dto(record);
  }

  async create(
    actor: AuthContext,
    input: CreateAdministradoraRequest,
    metadata: RequestMetadata,
  ): Promise<Administradora> {
    this.assert(actor, 'administradoras.create');
    try {
      const created = await this.prisma.$transaction(async (transaction) => {
        const record = await new AdministradorasRepository(transaction).create(
          input,
        );
        await transaction.auditLog.create({
          data: {
            action: 'ADMINISTRADORA_CREATED',
            actorId: actor.user.id,
            entity: 'Administradora',
            entityId: record.id,
            metadata: { after: summary(record) },
            ...auditMetadata(metadata),
          },
        });
        return record;
      });
      return dto(created);
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict();
      throw error;
    }
  }

  async update(
    actor: AuthContext,
    id: string,
    input: UpdateAdministradoraRequest,
    metadata: RequestMetadata,
  ): Promise<Administradora> {
    this.assert(actor, 'administradoras.update');
    try {
      const updated = await this.prisma.$transaction(async (transaction) => {
        const repository = new AdministradorasRepository(transaction);
        const before = await repository.findById(id);
        if (!before) throw notFound();
        const after = await repository.update(id, input);
        await transaction.auditLog.create({
          data: {
            action: 'ADMINISTRADORA_UPDATED',
            actorId: actor.user.id,
            entity: 'Administradora',
            entityId: id,
            metadata: {
              after: summary(after),
              before: summary(before),
              changedFields: Object.keys(input),
            },
            ...auditMetadata(metadata),
          },
        });
        return after;
      });
      return dto(updated);
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict();
      throw error;
    }
  }

  async setStatus(
    actor: AuthContext,
    id: string,
    ativa: boolean,
    metadata: RequestMetadata,
  ): Promise<Administradora> {
    this.assert(actor, 'administradoras.deactivate');
    const updated = await this.prisma.$transaction(async (transaction) => {
      const repository = new AdministradorasRepository(transaction);
      const before = await repository.findById(id);
      if (!before) throw notFound();
      const after = await repository.setStatus(id, ativa);
      await transaction.auditLog.create({
        data: {
          action: ativa
            ? 'ADMINISTRADORA_ACTIVATED'
            : 'ADMINISTRADORA_DEACTIVATED',
          actorId: actor.user.id,
          entity: 'Administradora',
          entityId: id,
          metadata: { after: { ativa }, before: { ativa: before.ativa } },
          ...auditMetadata(metadata),
        },
      });
      return after;
    });
    return dto(updated);
  }
}
