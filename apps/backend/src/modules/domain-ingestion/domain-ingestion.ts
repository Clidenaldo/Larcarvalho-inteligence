import { normalizeCnpj } from '@larcarvalho/shared';
import type { ImportacaoEstrategia, ImportacaoTipo } from '@larcarvalho/shared';

import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { RequestMetadata } from '../identity/identity.service.js';
import { diffUpdate } from '../importacoes/import-execution.js';
import type { FieldDiff } from '../importacoes/import-execution.js';


export type DomainIngestionValues = Record<string, unknown>;

export type DomainIngestionAction =
  | 'CREATE'
  | 'UPDATE'
  | 'IGNORE'
  | 'ERROR';

export interface DomainIngestionIssue {
  row: number;
  field?: string;
  value?: unknown;
  code: string;
  message: string;
  severity: 'WARNING' | 'ERROR';
}

export interface PreparedDomainRecord {
  row: number;
  values: DomainIngestionValues;
  action: DomainIngestionAction;
  existingId?: string;
  key?: string;
  issues: DomainIngestionIssue[];
  effectiveData?: Record<string, unknown>;
  fieldDiffs?: FieldDiff[];
  skippedByPolicy?: string[];
  currentData?: Record<string, unknown>;
}

export type DomainIngestionDb =
  | PrismaClient
  | Prisma.TransactionClient;

export interface DomainAuditContext {
  actorId: string;
  sourceMetadata: Prisma.InputJsonObject;
  meta: RequestMetadata;
}

export interface PrepareDomainRecordInput {
  db: DomainIngestionDb;
  tipo: ImportacaoTipo;
  values: DomainIngestionValues;
  row: number;
  strategy: ImportacaoEstrategia;
}

const domainText = (value: unknown) =>
  value === null || value === undefined || String(value).trim() === ''
    ? null
    : String(value).trim();

function isValidDomainUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

export async function resolveDomainAdmin(
  db: DomainIngestionDb,
  v: DomainIngestionValues,
) {
  const id = domainText(v.administradoraId);

  if (id && isValidDomainUuid(id))
    return db.administradora.findUnique({
      where: { id },
      select: { id: true },
    });

  if (id && !isValidDomainUuid(id)) {
    return null;
  }

  const external = domainText(v.administradoraCodigoExterno);

  if (external) {
    const rows = await db.administradora.findMany({
      where: { codigoExterno: external },
      select: { id: true },
      take: 2,
    });

    return rows.length === 1 ? rows[0] : null;
  }

  const cnpj = domainText(v.administradoraCnpj);

  if (cnpj)
    return db.administradora.findUnique({
      where: { cnpj: normalizeCnpj(cnpj) },
      select: { id: true },
    });

  return null;
}

export async function resolveDomainGroup(
  db: DomainIngestionDb,
  v: DomainIngestionValues,
) {
  const id = domainText(v.grupoId);

  if (id)
    return db.grupo.findUnique({
      where: { id },
      select: { id: true, administradoraId: true },
    });

  const code = domainText(v.grupoCodigo);

  if (!code) return null;

  const admin = await resolveDomainAdmin(db, v);

  if (!admin) return null;

  return db.grupo.findUnique({
    where: {
      administradoraId_codigo: {
        administradoraId: admin.id,
        codigo: code,
      },
    },
    select: { id: true, administradoraId: true },
  });
}

export async function resolveDomainAssembly(
  db: DomainIngestionDb,
  v: DomainIngestionValues,
) {
  const id = domainText(v.assembleiaId);

  if (id)
    return db.assembleia.findUnique({
      where: { id },
      select: { id: true, grupoId: true },
    });

  const numero = domainText(v.assembleiaNumero);
  const group = await resolveDomainGroup(db, v);

  if (!numero || !group) return null;

  return db.assembleia.findUnique({
    where: {
      grupoId_numero: {
        grupoId: group.id,
        numero,
      },
    },
    select: { id: true, grupoId: true },
  });
}

export async function resolveDomainQuota(
  db: DomainIngestionDb,
  v: DomainIngestionValues,
  groupId?: string,
) {
  const id = domainText(v.cotaId);

  if (id)
    return db.cota.findUnique({
      where: { id },
      select: { id: true, grupoId: true },
    });

  const numero = domainText(v.cotaNumero);

  if (!numero) return null;

  const gid = groupId ?? (await resolveDomainGroup(db, v))?.id;

  if (!gid) return null;

  return db.cota.findUnique({
    where: {
      grupoId_numero: {
        grupoId: gid,
        numero,
      },
    },
    select: { id: true, grupoId: true },
  });
}
export async function fetchDomainCurrentRecord(
  db: DomainIngestionDb,
  tipo: ImportacaoTipo,
  id: string,
): Promise<Record<string, unknown> | null> {
  if (tipo === 'ADMINISTRADORAS')
    return db.administradora.findUnique({ where: { id } }) as Promise<Record<string, unknown> | null>;
  if (tipo === 'PRODUTOS')
    return db.produto.findUnique({ where: { id } }) as Promise<Record<string, unknown> | null>;
  if (tipo === 'GRUPOS')
    return db.grupo.findUnique({ where: { id } }) as Promise<Record<string, unknown> | null>;
  if (tipo === 'COTAS')
    return db.cota.findUnique({ where: { id } }) as Promise<Record<string, unknown> | null>;
  if (tipo === 'ASSEMBLEIAS')
    return db.assembleia.findUnique({ where: { id } }) as Promise<Record<string, unknown> | null>;
  if (tipo === 'TABELAS_COMERCIAIS')
    return db.tabelaComercialItem.findUnique({ where: { id } }) as Promise<Record<string, unknown> | null>;
  if (tipo === 'LANCES')
    return db.lance.findUnique({ where: { id } }) as Promise<Record<string, unknown> | null>;
  if (tipo === 'CONTEMPLACOES')
    return db.contemplacao.findUnique({ where: { id } }) as Promise<Record<string, unknown> | null>;
  return null;
}

export async function domainRecordExistsById(
  db: Prisma.TransactionClient,
  tipo: ImportacaoTipo,
  id: string,
): Promise<boolean> {
  if (tipo === 'ADMINISTRADORAS')
    return (await db.administradora.findUnique({ where: { id }, select: { id: true } })) !== null;
  if (tipo === 'PRODUTOS')
    return (await db.produto.findUnique({ where: { id }, select: { id: true } })) !== null;
  if (tipo === 'GRUPOS')
    return (await db.grupo.findUnique({ where: { id }, select: { id: true } })) !== null;
  if (tipo === 'COTAS')
    return (await db.cota.findUnique({ where: { id }, select: { id: true } })) !== null;
  if (tipo === 'ASSEMBLEIAS')
    return (await db.assembleia.findUnique({ where: { id }, select: { id: true } })) !== null;
  if (tipo === 'TABELAS_COMERCIAIS')
    return (await db.tabelaComercialItem.findUnique({ where: { id }, select: { id: true } })) !== null;
  if (tipo === 'LANCES')
    return (await db.lance.findUnique({ where: { id }, select: { id: true } })) !== null;
  if (tipo === 'CONTEMPLACOES')
    return (await db.contemplacao.findUnique({ where: { id }, select: { id: true } })) !== null;
  return false;
}

export async function prepareDomainRecord(
  db: DomainIngestionDb,
  tipo: ImportacaoTipo,
  values: DomainIngestionValues,
  row: number,
  strategy: ImportacaoEstrategia,
): Promise<PreparedDomainRecord> {
  const issues: DomainIngestionIssue[] = [];
  let existingId: string | undefined;
  let key: string | undefined;
  if (tipo === 'ADMINISTRADORAS') {
    const cnpj = domainText(values.cnpj);
    const external = domainText(values.codigoExterno);
    key = cnpj ? `cnpj:${cnpj}` : external ? `ext:${external}` : undefined;
    const candidates = cnpj
      ? [
          await db.administradora.findUnique({
            where: { cnpj },
            select: { id: true },
          }),
        ].filter((item): item is { id: string } => Boolean(item))
      : external
        ? await db.administradora.findMany({
            where: { codigoExterno: external },
            select: { id: true },
            take: 2,
          })
        : [];
    if (candidates.length > 1)
      issues.push({
        row,
        field: 'codigoExterno',
        code: 'AMBIGUOUS_KEY',
        message: 'CÃ³digo externo identifica mais de uma administradora',
        severity: 'ERROR',
      });
    const existing = candidates.length === 1 ? candidates[0] : null;
    existingId = existing?.id;
  } else if (tipo === 'PRODUTOS' || tipo === 'GRUPOS') {
    const admin = await resolveDomainAdmin(db, values);
    if (!admin)
      issues.push({
        row,
        field: 'administradora',
        code: 'REFERENCE_NOT_FOUND',
        message: 'Administradora nÃ£o encontrada de forma inequÃ­voca',
        severity: 'ERROR',
      });
    else {
      values.administradoraId = admin.id;
      if (tipo === 'PRODUTOS') {
        const ext = domainText(values.codigoExterno);
        const name = domainText(values.nome)!;
        const category = domainText(values.categoria)!;
        key = ext
          ? `${admin.id}:ext:${ext}`
          : `${admin.id}:${name.toLowerCase()}:${category}`;
        const found = await db.produto.findMany({
          where: ext
            ? { administradoraId: admin.id, codigoExterno: ext }
            : {
                administradoraId: admin.id,
                nome: { equals: name, mode: 'insensitive' },
                categoria: category,
              },
          select: { id: true },
          take: 2,
        });
        if (found.length > 1)
          issues.push({
            row,
            field: ext ? 'codigoExterno' : 'nome',
            code: 'AMBIGUOUS_KEY',
            message: 'Chave contextual identifica mais de um produto',
            severity: 'ERROR',
          });
        existingId = found.length === 1 ? found[0]?.id : undefined;
      } else {
        const code = domainText(values.codigo)!;
        key = `${admin.id}:${code}`;
        existingId = (
          await db.grupo.findUnique({
            where: {
              administradoraId_codigo: {
                administradoraId: admin.id,
                codigo: code,
              },
            },
            select: { id: true },
          })
        )?.id;
        const productId = domainText(values.produtoId);
        const pext = domainText(values.produtoCodigoExterno);
        if (productId || pext) {
          const products = productId
            ? [
                await db.produto.findUnique({
                  where: { id: productId },
                  select: { id: true, administradoraId: true },
                }),
              ].filter(
                (item): item is { id: string; administradoraId: string } =>
                  Boolean(item),
              )
            : await db.produto.findMany({
                where: { administradoraId: admin.id, codigoExterno: pext },
                select: { id: true, administradoraId: true },
                take: 2,
              });
          const product = products.length === 1 ? products[0] : null;
          if (!product || product.administradoraId !== admin.id)
            issues.push({
              row,
              field: 'produto',
              code:
                products.length > 1
                  ? 'AMBIGUOUS_REFERENCE'
                  : 'REFERENCE_NOT_FOUND',
              message:
                products.length > 1
                  ? 'CÃ³digo identifica mais de um produto'
                  : 'Produto nÃ£o encontrado na administradora',
              severity: 'ERROR',
            });
          else values.produtoId = product.id;
        }
      }
    }
  } else if (tipo === 'TABELAS_COMERCIAIS') {
    const admin = await resolveDomainAdmin(db, values);
    if (!admin)
      issues.push({
        row,
        field: 'administradora',
        code: 'REFERENCE_NOT_FOUND',
        message: 'Administradora nÃ£o encontrada por ID ou CNPJ',
        severity: 'ERROR',
      });
    else {
      values.administradoraId = admin.id;
      const productId = domainText(values.produtoId);
      if (productId) {
        const product = await db.produto.findUnique({
          where: { id: productId },
          select: { administradoraId: true },
        });
        if (!product || product.administradoraId !== admin.id)
          issues.push({
            row,
            field: 'produtoId',
            code: 'RELATIONSHIP_CONFLICT',
            message: 'Produto nÃ£o pertence Ã  administradora',
            severity: 'ERROR',
          });
      }
      const code = domainText(values.tabelaCodigo)!;
      const start = values.inicioVigencia as Date;
      const credit = domainText(values.creditoReferencia)!;
      const term = values.prazoMeses as number;
      const modality = domainText(values.modalidade)!;
      const codigoPlano = domainText(values.codigoPlano)!;
      key = `${admin.id}:${code}:${start.toISOString().slice(0, 10)}:${credit}:${term}:${modality}:${codigoPlano}`;
      const table = await db.tabelaComercial.findUnique({
        where: {
          administradoraId_codigo_inicioVigencia: {
            administradoraId: admin.id,
            codigo: code,
            inicioVigencia: start,
          },
        },
        select: { id: true },
      });
      if (table) {
        values.tabelaComercialId = table.id;
        existingId = (
          await db.tabelaComercialItem.findFirst({
            where: {
                tabelaComercialId: table.id,
                creditoReferencia: credit,
                prazoMeses: term,
                modalidade: modality as never,
                codigoPlano: codigoPlano,
            },
            select: { id: true },
          })
        )?.id;
      }
    }
  } else if (tipo === 'COTAS' || tipo === 'ASSEMBLEIAS') {
    const group = await resolveDomainGroup(db, values);
    if (!group)
      issues.push({
        row,
        field: 'grupo',
        code: 'REFERENCE_NOT_FOUND',
        message: 'Grupo nÃ£o encontrado de forma inequÃ­voca',
        severity: 'ERROR',
      });
    else {
      values.grupoId = group.id;
      if (tipo === 'COTAS') {
        const numero = domainText(values.numero)!;
        key = `${group.id}:${numero}`;
        existingId = (
          await db.cota.findUnique({
            where: { grupoId_numero: { grupoId: group.id, numero } },
            select: { id: true },
          })
        )?.id;
      } else {
        const numero = domainText(values.numero);
        key = numero ? `${group.id}:${numero}` : undefined;
        if (numero)
          existingId = (
            await db.assembleia.findUnique({
              where: { grupoId_numero: { grupoId: group.id, numero } },
              select: { id: true },
            })
          )?.id;
      }
    }
  } else {
    const assembly = await resolveDomainAssembly(db, values);
    if (!assembly)
      issues.push({
        row,
        field: 'assembleia',
        code: 'REFERENCE_NOT_FOUND',
        message: 'Assembleia nÃ£o encontrada de forma inequÃ­voca',
        severity: 'ERROR',
      });
    else {
      values.assembleiaId = assembly.id;
      const quota = await resolveDomainQuota(db, values, assembly.grupoId);
      if (domainText(values.cotaId) || domainText(values.cotaNumero)) {
        if (!quota || quota.grupoId !== assembly.grupoId)
          issues.push({
            row,
            field: 'cota',
            code: 'RELATIONSHIP_CONFLICT',
            message: 'Cota nÃ£o pertence ao grupo da assembleia',
            severity: 'ERROR',
          });
        else values.cotaId = quota.id;
      }
      if (tipo === 'LANCES') {
        const lanceTipo = domainText(values.tipo);
        const cotaRef = domainText(values.cotaId);
        if (lanceTipo && cotaRef) {
          key = `${assembly.id}:${cotaRef}:${lanceTipo}`;
          const existing = await db.lance.findFirst({
            where: {
              assembleiaId: assembly.id,
              cotaId: cotaRef,
              tipo: lanceTipo,
            },
            select: { id: true },
          });
          existingId = existing?.id;
        }
      }
      if (tipo === 'CONTEMPLACOES') {
        const ext = domainText(values.codigoExterno);
        key = ext ? `${assembly.id}:${ext}` : undefined;
        if (ext)
          existingId = (
            await db.contemplacao.findUnique({
              where: {
                assembleiaId_codigoExterno: {
                  assembleiaId: assembly.id,
                  codigoExterno: ext,
                },
              },
              select: { id: true },
            })
          )?.id;
      }
    }
  }
  if (issues.length)
    return { row, values, action: 'ERROR', ...(key ? { key } : {}), issues };
  if (existingId && strategy === 'ATUALIZAR' && (key || tipo !== 'LANCES')) {
    const currentRecord = await domainRecordExistsById(db, tipo, existingId)
      ? await fetchDomainCurrentRecord(db, tipo, existingId)
      : null;
    const { diffs, effectiveData, skippedByPolicy } = diffUpdate(
      tipo,
      values as Record<string, unknown>,
      (currentRecord ?? {}) as Record<string, unknown>,
    );
    for (const field of skippedByPolicy) {
      if (!(field in effectiveData) && currentRecord && field in currentRecord) {
        effectiveData[field] = currentRecord[field];
      }
    }
    return {
      row,
      values,
      existingId,
      ...(key ? { key } : {}),
      action: 'UPDATE',
      issues,
      effectiveData,
      fieldDiffs: diffs,
      skippedByPolicy,
      currentData: (currentRecord ?? {}) as Record<string, unknown>,
    };
  }
  if (
    strategy === 'ATUALIZAR' &&
    (tipo === 'LANCES' || (tipo === 'CONTEMPLACOES' && !key))
  )
    issues.push({
      row,
      code: 'NO_RELIABLE_UPDATE_KEY',
      message: 'Sem chave confiÃ¡vel; o registro serÃ¡ criado, nunca atualizado',
      severity: 'WARNING',
    });
  if (existingId)
    return {
      row,
      values,
      existingId,
      ...(key ? { key } : {}),
      action: 'IGNORE',
      issues: [
        {
          row,
          code: 'DATABASE_DUPLICATE',
          message: 'Registro jÃ¡ existe e serÃ¡ ignorado',
          severity: 'WARNING',
        },
      ],
    };
  return { row, values, ...(key ? { key } : {}), action: 'CREATE', issues };
}

export async function persistDomainRecord(
  db: Prisma.TransactionClient,
  tipo: ImportacaoTipo,
  item: PreparedDomainRecord,
  auditContext?: DomainAuditContext,
) {
  const v = item.action === 'UPDATE' && item.effectiveData
    ? { ...item.values, ...item.effectiveData } as DomainIngestionValues
    : item.values;
  const id = item.existingId;
  if (tipo === 'ADMINISTRADORAS') {
    const data = {
      nome: domainText(v.nome)!,
      nomeFantasia: domainText(v.nomeFantasia),
      cnpj: domainText(v.cnpj),
      codigoExterno: domainText(v.codigoExterno),
      site: domainText(v.site),
      ativa: (v.ativa as boolean | null) ?? true,
    };
    return id
      ? db.administradora.update({ where: { id }, data })
      : db.administradora.create({ data });
  }
  if (tipo === 'PRODUTOS') {
    const data = {
      administradoraId: domainText(v.administradoraId)!,
      nome: domainText(v.nome)!,
      categoria: domainText(v.categoria)!,
      descricao: domainText(v.descricao),
      codigoExterno: domainText(v.codigoExterno),
      ativo: (v.ativo as boolean | null) ?? true,
    };
    return id
      ? db.produto.update({ where: { id }, data })
      : db.produto.create({ data });
  }
  if (tipo === 'GRUPOS') {
    const data = {
      administradoraId: domainText(v.administradoraId)!,
      produtoId: domainText(v.produtoId),
      codigo: domainText(v.codigo)!,
      status: domainText(v.status)!,
      dataInicio: v.dataInicio as Date | null,
      dataEncerramento: v.dataEncerramento as Date | null,
      prazoMeses: v.prazoMeses as number | null,
      quantidadeCotas: v.quantidadeCotas as number | null,
      valorCreditoMinimo: v.valorCreditoMinimo as string | null,
      valorCreditoMaximo: v.valorCreditoMaximo as string | null,
    };
    return id
      ? db.grupo.update({ where: { id }, data })
      : db.grupo.create({ data });
  }
  if (tipo === 'TABELAS_COMERCIAIS') {
    const administradoraId = domainText(v.administradoraId)!;
    const codigo = domainText(v.tabelaCodigo)!;
    const inicioVigencia = v.inicioVigencia as Date;
    let table = await db.tabelaComercial.findUnique({
      where: {
        administradoraId_codigo_inicioVigencia: {
          administradoraId,
          codigo,
          inicioVigencia,
        },
      },
      select: { id: true },
    });
    if (!table) {
      table = await db.tabelaComercial.create({
        data: {
          administradoraId,
          produtoId: domainText(v.produtoId),
          nome: domainText(v.tabelaNome) ?? codigo,
          codigo,
          categoria: domainText(v.categoria)!,
          inicioVigencia,
          status: 'ATIVA',
          origem: 'IMPORTACAO',
        },
        select: { id: true },
      });
      if (auditContext)
        await db.auditLog.create({
          data: {
            action: 'TABELA_COMERCIAL_CREATED',
            actorId: auditContext.actorId,
            entity: 'TabelaComercial',
            entityId: table.id,
            metadata: auditContext.sourceMetadata,
            ipAddress: auditContext.meta.ipAddress ?? null,
            userAgent: auditContext.meta.userAgent?.slice(0, 2048) ?? null,
          },
        });
    }
    const data = {
      tabelaComercialId: table.id,
      codigoExterno: domainText(v.codigoExterno),
      creditoReferencia: domainText(v.creditoReferencia)!,
      seguro: domainText(v.seguro),
      taxaAntecipadaValor: domainText(v.taxaAntecipadaValor),
      taxaAntecipadaPercentual: domainText(v.taxaAntecipadaPercentual),
      prazoMeses: v.prazoMeses as number,
      modalidade: domainText(v.modalidade)! as never,
      primeiraParcela: domainText(v.primeiraParcela),
      demaisParcelas: domainText(v.demaisParcelas),
      parcelaPadrao: domainText(v.parcelaPadrao),
      fundoReservaPercentual: domainText(v.fundoReservaPercentual),
      taxaAdministracaoPercentual: domainText(v.taxaAdministracaoPercentual),
      taxaTotalPercentual: domainText(v.taxaTotalPercentual),
      seguroVidaPercentual: domainText(v.seguroVidaPercentual),
      participantesGrupo: v.participantesGrupo as number | null,
      codigoPlano: domainText(v.codigoPlano),
    };
    const persisted = id
      ? db.tabelaComercialItem.update({ where: { id }, data })
      : db.tabelaComercialItem.create({ data });
    const result = await persisted;
    if (auditContext)
      await db.auditLog.create({
        data: {
          action: id ? 'ITEM_COMERCIAL_UPDATED' : 'ITEM_COMERCIAL_CREATED',
          actorId: auditContext.actorId,
          entity: 'TabelaComercialItem',
          entityId: result.id,
          metadata: {
            tabelaComercialId: table.id,
            ...auditContext.sourceMetadata,
          },
          ipAddress: auditContext.meta.ipAddress ?? null,
          userAgent: auditContext.meta.userAgent?.slice(0, 2048) ?? null,
        },
      });
    return result;
  }
  if (tipo === 'COTAS') {
    const data = {
      grupoId: domainText(v.grupoId)!,
      numero: domainText(v.numero)!,
      status: domainText(v.status)!,
      valorCredito: v.valorCredito as string | null,
      prazoRestante: v.prazoRestante as number | null,
      parcelaAtual: v.parcelaAtual as string | null,
      codigoExterno: domainText(v.codigoExterno),
    };
    return id
      ? db.cota.update({ where: { id }, data })
      : db.cota.create({ data });
  }
  if (tipo === 'ASSEMBLEIAS') {
    const data = {
      grupoId: domainText(v.grupoId)!,
      numero: domainText(v.numero),
      dataAssembleia: v.dataAssembleia as Date,
      status: domainText(v.status)!,
    };
    return id
      ? db.assembleia.update({ where: { id }, data })
      : db.assembleia.create({ data });
  }
  if (tipo === 'LANCES') {
    const data = {
      assembleiaId: domainText(v.assembleiaId)!,
      cotaId: domainText(v.cotaId),
      tipo: domainText(v.tipo)!,
      percentual: v.percentual as string | null,
      valor: v.valor as string | null,
      contemplado: v.contemplado as boolean | null,
      origem: domainText(v.origem)!,
    };
    return id
      ? db.lance.update({ where: { id }, data })
      : db.lance.create({ data });
  }
  const data = {
    assembleiaId: domainText(v.assembleiaId)!,
    cotaId: domainText(v.cotaId),
    tipo: domainText(v.tipo)!,
    codigoExterno: domainText(v.codigoExterno),
    valorLance: v.valorLance as string | null,
    percentualLance: v.percentualLance as string | null,
  };
  return id
    ? db.contemplacao.update({ where: { id }, data })
    : db.contemplacao.create({ data });
}
