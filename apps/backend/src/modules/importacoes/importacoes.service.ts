import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

import {
  fetchDomainCurrentRecord,
  persistDomainRecord,
  prepareDomainRecord,
} from '../domain-ingestion/domain-ingestion.js';import type {
  ArquivoTipo,
  ClassifyImportacaoRequest,
  ExecutionEntityPlan,
  ImportacaoEstrategia,
  ImportacaoIssueQuery,
  ImportacaoListQuery,
  ImportacaoMappingRequest,
  ImportacaoTipo,
  Permission,
} from '@larcarvalho/shared';
import {
  assembleiaStatuses,
  contemplacaoTipos,
  importacaoFields,
  importacaoRequiredFields,
  isCompatibleTarget,
  lanceOrigens,
  lanceTipos,
  modalidadesComerciais,
  produtoCategorias,
  statusOperacionais,
} from '@larcarvalho/shared';
import {
  toExecutionState,
  parentOf,
  detectConcurrencyChanges,
} from './import-execution.js';

import type { AuthContext } from '../../core/auth/auth-context.js';
import { hasPermission } from '../../core/auth/rbac.js';
import { AppError } from '../../core/errors/app-error.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { getBusinessMetrics } from '../../infrastructure/observability/business-metrics.js';
import type { RequestMetadata } from '../identity/identity.service.js';
import {
} from '../domain-ingestion/domain-ingestion.js';
import type {
  DomainIngestionIssue,
  DomainIngestionValues,
  PreparedDomainRecord,
} from '../domain-ingestion/domain-ingestion.js';
import {
  autoMapColumns,
  commercialProductMappingConflicts,
  needsReviewColumns,
  parseImportFile,
  publicImportFileMessage,
  type CellValue,
} from './import-file.js';
import {
  canonicalEnum,
  parseBoolean,
  parseBrazilianDecimal,
  parseCnpj,
  parseDate,
  parseInteger,
} from './import-normalizers.js';

type Row = Readonly<Record<string, CellValue>>;
type Values = DomainIngestionValues;
type Prepared = PreparedDomainRecord;
type Issue = DomainIngestionIssue;

const batchSize = 200;

const fail = (
  code:
    | 'IMPORTACAO_NOT_FOUND'
    | 'IMPORTACAO_CONFLICT'
    | 'IMPORTACAO_FILE_INVALID'
    | 'INVALID_IMPORT_TARGET',
  message: string,
  statusCode: number,
) => new AppError({ code, message, statusCode });

function assertCompatibleTarget(classificacao: ArquivoTipo, tipo: ImportacaoTipo) {
  if (!isCompatibleTarget(classificacao, tipo))
    throw fail(
      'INVALID_IMPORT_TARGET',
      `Tipo de arquivo ${classificacao} nÃ£o permite destino ${tipo}`,
      400,
    );
}
function mapping(
  value: Prisma.JsonValue | null,
): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}
function strings(value: Prisma.JsonValue | null): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];
}
const count = (value: number | null) => value ?? 0;
function dto(record: Prisma.ImportacaoGetPayload<{ select: typeof select }>) {
  if (
    !record.tipo ||
    !record.nomeArquivo ||
    !record.mimeType ||
    record.tamanhoBytes === null
  )
    throw fail(
      'IMPORTACAO_NOT_FOUND',
      'ImportaÃ§Ã£o legada sem metadados do fluxo',
      404,
    );
  return {
    id: record.id,
    tipo: record.tipo,
    classificacaoArquivo: record.classificacaoArquivo,
    nomeArquivo: record.nomeArquivo,
    mimeType: record.mimeType,
    tamanhoBytes: record.tamanhoBytes,
    status: record.status,
    abaSelecionada: record.abaSelecionada,
    abas: strings(record.abas),
    colunas: strings(record.colunas),
    mapeamento: mapping(record.mapeamento),
    estrategia: record.estrategia,
    iniciadaEm: record.iniciadaEm.toISOString(),
    validadaEm: record.validadaEm?.toISOString() ?? null,
    finalizadaEm: record.finalizadaEm?.toISOString() ?? null,
    totalRegistros: count(record.totalRegistros),
    registrosValidos: count(record.registrosValidos),
    registrosInvalidos: count(record.registrosInvalidos),
    registrosCriados: count(record.registrosCriados),
    registrosAtualizados: count(record.registrosAtualizados),
    registrosComAviso: count(record.registrosComAviso),
    registrosIgnorados: count(record.registrosIgnorados),
    registrosProcessados: count(record.registrosProcessados),
    erroResumo: record.erroResumo,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    criadoPor: record.criadoPor ?? null,
  };
}
const select = {
  id: true,
  tipo: true,
  classificacaoArquivo: true,
  nomeArquivo: true,
  mimeType: true,
  tamanhoBytes: true,
  arquivoTemporario: true,
  status: true,
  abaSelecionada: true,
  abas: true,
  colunas: true,
  mapeamento: true,
  mapeamentoConfirmado: true,
  estrategia: true,
  iniciadaEm: true,
  validadaEm: true,
  finalizadaEm: true,
  totalRegistros: true,
  registrosValidos: true,
  registrosInvalidos: true,
  registrosCriados: true,
  registrosAtualizados: true,
  registrosComAviso: true,
  registrosIgnorados: true,
  registrosProcessados: true,
  erroResumo: true,
  createdAt: true,
  updatedAt: true,
  criadoPor: { select: { id: true, nome: true, email: true } },
} as const;

function valueOf(
  row: Row,
  map: Record<string, string>,
  field: string,
): unknown {
  const column = map[field];
  return column ? row[column] : undefined;
}
const text = (value: unknown) =>
  value === null || value === undefined || String(value).trim() === ''
    ? null
    : String(value).trim();
function required(
  values: Values,
  names: readonly string[],
  issues: Issue[],
  row: number,
) {
  for (const name of names)
    if (
      values[name] === null ||
      values[name] === undefined ||
      values[name] === ''
    )
      issues.push({
        row,
        field: name,
        code: 'REQUIRED_FIELD',
        message: 'Campo obrigatÃ³rio nÃ£o informado',
        severity: 'ERROR',
      });
}
function issueFrom(
  error: unknown,
  row: number,
  field: string,
  value: unknown,
): Issue {
  const code = error instanceof Error ? error.message : 'INVALID_VALUE';
  return {
    row,
    field,
    value,
    code,
    message: `Valor invÃ¡lido para ${field}`,
    severity: 'ERROR',
  };
}
function safe<T>(
  fn: () => T,
  row: number,
  field: string,
  value: unknown,
  issues: Issue[],
): T | null {
  try {
    return fn();
  } catch (error) {
    issues.push(issueFrom(error, row, field, value));
    return null;
  }
}


function normalizeRow(
  tipo: ImportacaoTipo,
  row: Row,
  map: Record<string, string>,
  line: number,
): { values: Values; issues: Issue[] } {
  const issues: Issue[] = [];
  const v: Values = {};
  for (const field of importacaoFields[tipo])
    v[field] = text(valueOf(row, map, field));
  const decimalFields = [
    'valorCreditoMinimo',
    'valorCreditoMaximo',
    'valorCredito',
    'parcelaAtual',
    'percentual',
    'valor',
    'valorLance',
    'percentualLance',
    'creditoReferencia',
    'seguro',
    'taxaAntecipadaValor',
    'taxaAntecipadaPercentual',
    'primeiraParcela',
    'demaisParcelas',
    'parcelaPadrao',
    'fundoReservaPercentual',
    'taxaAdministracaoPercentual',
    'taxaTotalPercentual',
    'seguroVidaPercentual',
  ];
  const integerFields = [
    'prazoMeses',
    'quantidadeCotas',
    'prazoRestante',
    'participantesGrupo',
  ];
  for (const field of decimalFields)
    if (field in v)
      v[field] = safe(
        () => parseBrazilianDecimal(valueOf(row, map, field)),
        line,
        field,
        valueOf(row, map, field),
        issues,
      );
  for (const field of [
    'percentual',
    'percentualLance',
    'taxaAntecipadaPercentual',
    'fundoReservaPercentual',
    'taxaAdministracaoPercentual',
    'taxaTotalPercentual',
    'seguroVidaPercentual',
  ]) {
    const value = v[field];
    const maximum = ['percentual', 'percentualLance'].includes(field)
      ? 999.999999
      : 100;
    if (
      typeof value === 'string' &&
      (Number(value) < 0 || Number(value) > maximum)
    )
      issues.push({
        row: line,
        field,
        value,
        code: 'PERCENTAGE_OUT_OF_RANGE',
        message: 'Percentual estÃ¡ fora do limite do schema',
        severity: 'ERROR',
      });
  }
  for (const field of integerFields)
    if (field in v)
      v[field] = safe(
        () => parseInteger(valueOf(row, map, field)),
        line,
        field,
        valueOf(row, map, field),
        issues,
      );
  for (const field of ['ativa', 'ativo', 'contemplado'])
    if (field in v)
      v[field] = safe(
        () => parseBoolean(valueOf(row, map, field)),
        line,
        field,
        valueOf(row, map, field),
        issues,
      );
  for (const field of ['dataInicio', 'dataEncerramento', 'inicioVigencia'])
    if (field in v)
      v[field] = safe(
        () => parseDate(valueOf(row, map, field)),
        line,
        field,
        valueOf(row, map, field),
        issues,
      );
  if ('dataAssembleia' in v)
    v.dataAssembleia = safe(
      () => parseDate(valueOf(row, map, 'dataAssembleia'), true),
      line,
      'dataAssembleia',
      valueOf(row, map, 'dataAssembleia'),
      issues,
    );
  for (const field of ['cnpj', 'administradoraCnpj'])
    if (field in v)
      v[field] = safe(
        () => parseCnpj(valueOf(row, map, field)),
        line,
        field,
        valueOf(row, map, field),
        issues,
      );
  if ('categoria' in v && v.categoria)
    v.categoria = safe(
      () =>
        canonicalEnum(v.categoria, produtoCategorias, {
          AUTOMOVEL: 'AUTOMOVEL',
        }),
      line,
      'categoria',
      v.categoria,
      issues,
    );
  if ('status' in v && v.status && tipo !== 'ASSEMBLEIAS')
    v.status = safe(
      () => canonicalEnum(v.status, statusOperacionais),
      line,
      'status',
      v.status,
      issues,
    );
  if (tipo === 'ASSEMBLEIAS' && v.status)
    v.status = safe(
      () => canonicalEnum(v.status, assembleiaStatuses),
      line,
      'status',
      v.status,
      issues,
    );
  if (tipo === 'LANCES') {
    if (v.tipo)
      v.tipo = safe(
        () => canonicalEnum(v.tipo, lanceTipos),
        line,
        'tipo',
        v.tipo,
        issues,
      );
    if (v.origem)
      v.origem = safe(
        () => canonicalEnum(v.origem, lanceOrigens),
        line,
        'origem',
        v.origem,
        issues,
      );
  }
  if (tipo === 'CONTEMPLACOES' && v.tipo)
    v.tipo = safe(
      () => canonicalEnum(v.tipo, contemplacaoTipos),
      line,
      'tipo',
      v.tipo,
      issues,
    );
  if (tipo === 'TABELAS_COMERCIAIS' && v.modalidade)
    v.modalidade = safe(
      () => canonicalEnum(v.modalidade, modalidadesComerciais),
      line,
      'modalidade',
      v.modalidade,
      issues,
    );
  required(v, importacaoRequiredFields[tipo], issues, line);
  if (
    tipo === 'TABELAS_COMERCIAIS' &&
    !text(v.administradoraId) &&
    !text(v.administradoraCnpj)
  )
    issues.push({
      row: line,
      field: 'administradora',
      code: 'REQUIRED_RELATIONSHIP',
      message: 'Informe administradoraId ou administradoraCnpj',
      severity: 'ERROR',
    });
  if (
    tipo === 'TABELAS_COMERCIAIS' &&
    typeof v.creditoReferencia === 'string' &&
    Number(v.creditoReferencia) <= 0
  )
    issues.push({
      row: line,
      field: 'creditoReferencia',
      value: v.creditoReferencia,
      code: 'VALUE_OUT_OF_RANGE',
      message: 'CrÃ©dito de referÃªncia deve ser maior que zero',
      severity: 'ERROR',
    });
  if (
    tipo === 'TABELAS_COMERCIAIS' &&
    typeof v.prazoMeses === 'number' &&
    v.prazoMeses <= 0
  )
    issues.push({
      row: line,
      field: 'prazoMeses',
      value: v.prazoMeses,
      code: 'VALUE_OUT_OF_RANGE',
      message: 'Prazo deve ser maior que zero',
      severity: 'ERROR',
    });
  if (tipo === 'TABELAS_COMERCIAIS')
    for (const field of [
      'seguro',
      'taxaAntecipadaValor',
      'primeiraParcela',
      'demaisParcelas',
      'parcelaPadrao',
    ])
      if (typeof v[field] === 'string' && Number(v[field]) < 0)
        issues.push({
          row: line,
          field,
          value: v[field],
          code: 'VALUE_OUT_OF_RANGE',
          message: `${field} nÃ£o pode ser negativo`,
          severity: 'ERROR',
        });
  if (
    typeof v.valorCreditoMinimo === 'string' &&
    typeof v.valorCreditoMaximo === 'string' &&
    Number(v.valorCreditoMaximo) < Number(v.valorCreditoMinimo)
  )
    issues.push({
      row: line,
      code: 'INCONSISTENT_RANGE',
      message: 'Valor mÃ¡ximo Ã© menor que o mÃ­nimo',
      severity: 'ERROR',
    });
  return { values: v, issues };
}


export class ImportacoesService {
  constructor(private readonly db: PrismaClient) {}
  private allow(actor: AuthContext, permission: Permission) {
    if (!hasPermission(actor, permission))
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Acesso nÃ£o autorizado',
        statusCode: 403,
      });
  }
  private async record(id: string) {
    const value = await this.db.importacao.findUnique({
      where: { id },
      select,
    });
    if (!value)
      throw fail('IMPORTACAO_NOT_FOUND', 'ImportaÃ§Ã£o nÃ£o encontrada', 404);
    return value;
  }
  private async parsed(
    record: Awaited<ReturnType<ImportacoesService['record']>>,
    sheet?: string,
  ) {
    if (!record.arquivoTemporario)
      throw fail(
        'IMPORTACAO_CONFLICT',
        'Arquivo temporÃ¡rio nÃ£o estÃ¡ mais disponÃ­vel',
        409,
      );
    try {
      const bytes = await readFile(record.arquivoTemporario);
      return parseImportFile(
        record.nomeArquivo!,
        record.mimeType!,
        bytes,
        sheet ?? record.abaSelecionada ?? undefined,
      );
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw fail(
        'IMPORTACAO_FILE_INVALID',
        `Arquivo invÃ¡lido: ${publicImportFileMessage(error)}`,
        400,
      );
    }
  }
  private audit(
    action: string,
    actor: AuthContext,
    id: string,
    metadata: Prisma.InputJsonValue,
    meta: RequestMetadata,
  ) {
    return this.db.auditLog.create({
      data: {
        action,
        actorId: actor.user.id,
        entity: 'Importacao',
        entityId: id,
        metadata,
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent?.slice(0, 2048) ?? null,
      },
    });
  }
  async upload(
    actor: AuthContext,
    input: {
      tipo: ImportacaoTipo;
      classificacaoArquivo?: ArquivoTipo;
      filename: string;
      mime: string;
      bytes: Buffer;
    },
    meta: RequestMetadata,
  ) {
    this.allow(actor, 'importacoes.create');
    if (input.tipo === 'TABELAS_COMERCIAIS')
      this.allow(actor, 'tabelas_comerciais.import');
    if (input.classificacaoArquivo)
      assertCompatibleTarget(input.classificacaoArquivo, input.tipo);
    let parsed;
    try {
      parsed = parseImportFile(input.filename, input.mime, input.bytes);
    } catch (error) {
      throw fail(
        'IMPORTACAO_FILE_INVALID',
        `Arquivo invÃ¡lido: ${publicImportFileMessage(error)}`,
        error instanceof Error && error.message === 'FILE_TOO_LARGE'
          ? 413
          : 400,
      );
    }
    const directory = join(tmpdir(), 'larcarvalho-importacoes');
    await mkdir(directory, { recursive: true });
    const path = join(
      directory,
      `${randomUUID()}${extname(input.filename).toLowerCase()}`,
    );
    await writeFile(path, input.bytes, { flag: 'wx', mode: 0o600 });
    try {
      const result = await this.db.$transaction(async (tx) => {
        let source = await tx.fonteDados.findFirst({
          where: {
            nome: `Upload manual ${extname(input.filename).slice(1).toUpperCase()}`,
            administradoraId: null,
          },
          select: { id: true },
        });
        source ??= await tx.fonteDados.create({
          data: {
            nome: `Upload manual ${extname(input.filename).slice(1).toUpperCase()}`,
            tipo:
              extname(input.filename).toLowerCase() === '.csv' ? 'CSV' : 'XLSX',
            descricao:
              'Arquivos enviados manualmente pelo mÃ³dulo de importaÃ§Ãµes',
          },
          select: { id: true },
        });
        return tx.importacao.create({
          data: {
            fonteDadosId: source.id,
            criadoPorId: actor.user.id,
            tipo: input.tipo,
            ...(input.classificacaoArquivo
              ? { classificacaoArquivo: input.classificacaoArquivo }
              : {}),
            nomeArquivo: basename(input.filename).slice(0, 255),
            mimeType: input.mime.slice(0, 150),
            tamanhoBytes: input.bytes.length,
            arquivoTemporario: path,
            abas: parsed.sheets,
            abaSelecionada: parsed.selectedSheet,
            colunas: parsed.columns,
            mapeamento: autoMapColumns(input.tipo, parsed.columns),
            totalRegistros: parsed.rows.length,
          },
          select,
        });
      });
      await this.audit(
        'IMPORTACAO_CREATED',
        actor,
        result.id,
        {
          tipo: input.tipo,
          ...(input.classificacaoArquivo
            ? { classificacao: input.classificacaoArquivo }
            : {}),
          arquivo: basename(input.filename),
          tamanhoBytes: input.bytes.length,
        },
        meta,
      );
      return dto(result);
    } catch (error) {
      await unlink(path).catch(() => undefined);
      throw error;
    }
  }
  async list(actor: AuthContext, query: ImportacaoListQuery) {
    this.allow(actor, 'importacoes.read');
    const where: Prisma.ImportacaoWhereInput = {
      tipo: { not: null },
      ...(query.tipo ? { tipo: query.tipo } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.importacao.findMany({
        where,
        select,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.importacao.count({ where }),
    ]);
    return {
      items: items.map(dto),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total ? Math.ceil(total / query.pageSize) : 0,
    };
  }
  async get(actor: AuthContext, id: string) {
    this.allow(actor, 'importacoes.read');
    return dto(await this.record(id));
  }
  async preview(actor: AuthContext, id: string, sheet?: string) {
    this.allow(actor, 'importacoes.read');
    const record = await this.record(id);
    const parsed = await this.parsed(record, sheet);
    return {
      importacao: {
        ...dto(record),
        abaSelecionada: parsed.selectedSheet,
        abas: [...parsed.sheets],
        colunas: [...parsed.columns],
        mapeamento:
          parsed.selectedSheet === record.abaSelecionada
            ? mapping(record.mapeamento)
            : autoMapColumns(record.tipo!, parsed.columns),
      },
      preview: parsed.rows.slice(0, 20),
      quantidadeAproximada: parsed.rows.length,
      needsReview: [...needsReviewColumns(record.tipo!, parsed.columns)],
    };
  }
  async classify(
    actor: AuthContext,
    id: string,
    input: ClassifyImportacaoRequest,
    meta: RequestMetadata,
  ) {
    this.allow(actor, 'importacoes.create');
    const record = await this.record(id);
    if (!['PENDENTE', 'PRONTA'].includes(record.status))
      throw fail(
        'IMPORTACAO_CONFLICT',
        'ClassificaÃ§Ã£o nÃ£o pode ser alterada neste estado',
        409,
      );
    if (!record.tipo)
      throw fail('IMPORTACAO_CONFLICT', 'ImportaÃ§Ã£o sem tipo definido', 409);
    assertCompatibleTarget(input.classificacaoArquivo, record.tipo);
    await this.db.importacao.update({
      where: { id },
      data: {
        classificacaoArquivo: input.classificacaoArquivo,
        // Trocar a classificaÃ§Ã£o invalida o mapeamento anterior: nunca
        // aplicar mapeamento salvo cegamente sob nova classificaÃ§Ã£o.
        mapeamento: Prisma.JsonNull,
        mapeamentoConfirmado: false,
        status: 'PENDENTE',
        validadaEm: null,
      },
    });
    await this.audit(
      'IMPORTACAO_CLASSIFIED',
      actor,
      id,
      { classificacao: input.classificacaoArquivo, tipo: record.tipo },
      meta,
    );
    return dto(await this.record(id));
  }
  async saveMapping(
    actor: AuthContext,
    id: string,
    input: ImportacaoMappingRequest,
    meta: RequestMetadata,
  ) {
    this.allow(actor, 'importacoes.create');
    const record = await this.record(id);
    if (record.tipo === 'TABELAS_COMERCIAIS')
      this.allow(actor, 'tabelas_comerciais.import');
    if (!['PENDENTE', 'PRONTA'].includes(record.status))
      throw fail(
        'IMPORTACAO_CONFLICT',
        'Mapeamento nÃ£o pode ser alterado neste estado',
        409,
      );
    // Defesa em profundidade (fail fast, antes de ler o arquivo): mesmo com
    // mapping manual, o par (classificaÃ§Ã£o, destino) precisa respeitar a matriz.
    if (record.classificacaoArquivo && record.tipo)
      assertCompatibleTarget(record.classificacaoArquivo, record.tipo);
    const parsed = await this.parsed(record, input.aba);
    const allowed = new Set(importacaoFields[record.tipo!]);
    const columns = new Set(parsed.columns);
    const targets = Object.keys(input.mapeamento);
    if (
      targets.some((field) => !allowed.has(field as never)) ||
      Object.values(input.mapeamento).some((column) => !columns.has(column)) ||
      new Set(Object.values(input.mapeamento)).size !==
        Object.values(input.mapeamento).length
    )
      throw fail(
        'IMPORTACAO_CONFLICT',
        'Mapeamento contÃ©m campo, coluna inexistente ou coluna repetida',
        400,
      );
    for (const field of importacaoRequiredFields[record.tipo!])
      if (!input.mapeamento[field])
        throw fail(
          'IMPORTACAO_CONFLICT',
          `Campo obrigatÃ³rio sem mapeamento: ${field}`,
          400,
        );
    if (
      record.tipo === 'TABELAS_COMERCIAIS' &&
      !input.mapeamento.administradoraId &&
      !input.mapeamento.administradoraCnpj
    )
      throw fail(
        'IMPORTACAO_CONFLICT',
        'Mapeie administradoraId ou administradoraCnpj',
        400,
      );
    const updated = await this.db.importacao.update({
      where: { id },
      data: {
        abaSelecionada: parsed.selectedSheet,
        abas: parsed.sheets,
        colunas: parsed.columns,
        mapeamento: input.mapeamento,
        mapeamentoConfirmado: true,
        status: 'PENDENTE',
        validadaEm: null,
      },
      select,
    });
    await this.audit(
      'IMPORTACAO_MAPPING_SAVED',
      actor,
      id,
      { tipo: record.tipo, campos: targets },
      meta,
    );
    return dto(updated);
  }
private async analyze(
    record: Awaited<ReturnType<ImportacoesService['record']>>,
    strategy: ImportacaoEstrategia,
  ) {
    const map = mapping(record.mapeamento);
    if (!map || !record.mapeamentoConfirmado)
      throw fail(
        'IMPORTACAO_CONFLICT',
        'Mapeamento obrigatÃ³rio ainda nÃ£o foi revisado',
        409,
      );
    const parsed = await this.parsed(record);
    const prepared: Prepared[] = [];
    const seen = new Set<string>();
    const repeatedParent = record.classificacaoArquivo === 'COMMERCIAL_TABLE' &&
      (record.tipo === 'PRODUTOS' || record.tipo === 'ADMINISTRADORAS');
    const productMappingConflicts = record.tipo === 'PRODUTOS'
      ? commercialProductMappingConflicts(parsed.columns, map)
      : [];
    for (let index = 0; index < parsed.rows.length; index++) {
      const normalized = normalizeRow(
        record.tipo!,
        parsed.rows[index]!,
        map,
        index + 2,
      );
      for (const field of productMappingConflicts) normalized.issues.push({
        row: index + 2, field, value: map[field], code: 'REQUIRE_REVIEW', severity: 'ERROR',
        message: 'Coluna de tabela/oferta nÃ£o identifica um Produto. Mapeie dados explÃ­citos do Produto ou importe em TABELAS_COMERCIAIS sem produto vinculado.',
      });
      let item: Prepared = normalized.issues.length
        ? {
            row: index + 2,
            values: normalized.values,
            action: 'ERROR',
            issues: normalized.issues,
          }
        : await prepareDomainRecord(
            this.db,
            record.tipo!,
            normalized.values,
            index + 2,
            strategy,
          );
      if (!repeatedParent && item.key && seen.has(item.key))
        item = {
          ...item,
          action: 'ERROR',
          issues: [
            ...item.issues,
            {
              row: item.row,
              code: 'FILE_DUPLICATE',
              message: 'Chave duplicada dentro do arquivo',
              severity: 'ERROR',
            },
          ],
        };
      if (item.key) seen.add(item.key);
      prepared.push(item);
    }
    if (repeatedParent) {
      const groups = new Map<string, Prepared[]>();
      for (const item of prepared) {
        if (!item.key) continue;
        const group = groups.get(item.key) ?? [];
        group.push(item);
        groups.set(item.key, group);
      }
      const fields = record.tipo === 'PRODUTOS'
        ? ['administradoraId', 'nome', 'categoria', 'codigoExterno', 'descricao', 'ativo']
        : ['nome', 'nomeFantasia', 'cnpj', 'codigoExterno', 'site', 'ativa'];
      const signature = (item: Prepared) => JSON.stringify(fields.map((field) => {
        const value = item.values[field];
        if (field === 'ativo' || field === 'ativa') return value ?? true;
        if (field === 'nome') return text(value)?.toLowerCase() ?? null;
        return value ?? null;
      }));
      for (const [key, group] of groups) {
        const conflicting = new Set(group.map(signature)).size > 1 || group.some((item) => item.action === 'ERROR');
        if (conflicting && group.length > 1) {
          for (const item of group) {
            item.action = 'ERROR';
            item.issues.push({ row: item.row, code: 'PARENT_CONFLICT', severity: 'ERROR', value: key,
              message: 'Linhas da mesma entidade pai possuem dados conflitantes; revise todas as ocorrÃªncias antes de executar.' });
          }
        } else if (!conflicting) {
          for (const [index, item] of group.entries()) {
            if (index > 0) item.action = 'IGNORE';
            item.issues = item.issues.filter((issue) => issue.code !== 'DATABASE_DUPLICATE');
          }
        }
      }
    }
    return prepared;
  }
  async validate(
    actor: AuthContext,
    id: string,
    strategy: ImportacaoEstrategia,
    meta: RequestMetadata,
  ) {
    this.allow(actor, 'importacoes.create');
    const record = await this.record(id);
    if (record.tipo === 'TABELAS_COMERCIAIS')
      this.allow(actor, 'tabelas_comerciais.import');
    if (!['PENDENTE', 'PRONTA'].includes(record.status))
      throw fail(
        'IMPORTACAO_CONFLICT',
        'ImportaÃ§Ã£o nÃ£o pode ser validada neste estado',
        409,
      );
    if (!record.mapeamentoConfirmado || !mapping(record.mapeamento))
      throw fail(
        'IMPORTACAO_CONFLICT',
        'Mapeamento obrigatÃ³rio ainda nÃ£o foi revisado',
        409,
      );
    await this.db.importacao.update({
      where: { id },
      data: { status: 'VALIDANDO', estrategia: strategy },
    });
    try {
      const rows = await this.analyze(record, strategy);
      const issues = rows.flatMap((r) => r.issues).slice(0, 1000);
      const summary = {
        total: rows.length,
        validas: rows.filter((r) => r.action !== 'ERROR').length,
        avisos: rows.filter((r) =>
          r.issues.some((i) => i.severity === 'WARNING'),
        ).length,
        erros: rows.filter((r) => r.action === 'ERROR').length,
        novas: rows.filter((r) => r.action === 'CREATE').length,
        duplicadas: rows.filter((r) =>
          r.issues.some((i) =>
            ['FILE_DUPLICATE', 'DATABASE_DUPLICATE'].includes(i.code),
          ),
        ).length,
        atualizaveis: rows.filter((r) => r.action === 'UPDATE').length,
        ignoradas: rows.filter((r) => r.action === 'IGNORE').length,
      };
      await this.db.$transaction([
        this.db.dataQualityIssue.deleteMany({ where: { importacaoId: id } }),
        ...(issues.length
          ? [
              this.db.dataQualityIssue.createMany({
                data: issues.map((i) => ({
                  importacaoId: id,
                  entidade: record.tipo!,
                  registroId: String(i.row),
                  linha: i.row,
                  campo: i.field ?? null,
                  valorRecebido:
                    i.value === undefined
                      ? null
                      : String(i.value).slice(0, 1000),
                  codigo: i.code,
                  severidade: i.severity,
                  mensagem: i.message,
                })),
              }),
            ]
          : []),
        this.db.importacao.update({
          where: { id },
          data: {
            status: 'PRONTA',
            validadaEm: new Date(),
            totalRegistros: summary.total,
            registrosValidos: summary.validas,
            registrosInvalidos: summary.erros,
            registrosComAviso: summary.avisos,
            registrosIgnorados: summary.ignoradas,
            estrategia: strategy,
            erroResumo:
              issues.length >= 1000
                ? 'Problemas limitados aos primeiros 1000 registros'
                : null,
          },
        }),
      ]);
      await this.audit(
        'IMPORTACAO_VALIDATED',
        actor,
        id,
        { tipo: record.tipo, estrategia: strategy, ...summary },
        meta,
      );
      return summary;
    } catch (error) {
      await this.db.importacao.update({
        where: { id },
        data: {
          status: 'FALHOU',
          erroResumo:
            error instanceof Error
              ? error.message.slice(0, 2000)
              : 'Falha de validaÃ§Ã£o',
          finalizadaEm: new Date(),
          arquivoTemporario: null,
        },
      });
      if (record.arquivoTemporario)
        await unlink(record.arquivoTemporario).catch(() => undefined);
      await this.audit(
        'IMPORTACAO_FAILED',
        actor,
        id,
        { tipo: record.tipo, etapa: 'VALIDACAO' },
        meta,
      );
      throw error;
    }
  }
  async plan(actor: AuthContext, id: string, _meta: RequestMetadata) {
    this.allow(actor, 'importacoes.create');
    const record = await this.record(id);
    if (record.tipo === 'TABELAS_COMERCIAIS')
      this.allow(actor, 'tabelas_comerciais.import');
    if (!['PENDENTE', 'PRONTA'].includes(record.status))
      throw fail(
        'IMPORTACAO_CONFLICT',
        'ImportaÃ§Ã£o nÃ£o possui dados suficientes para gerar plano',
        409,
      );
    if (!record.mapeamentoConfirmado || !mapping(record.mapeamento))
      throw fail(
        'IMPORTACAO_CONFLICT',
        'Mapeamento obrigatÃ³rio ainda nÃ£o foi revisado',
        409,
      );
    const strategy = record.estrategia ?? 'IGNORAR';
    const rows = await this.analyze(record, strategy);
    const entityMap = new Map<ImportacaoTipo, ExecutionEntityPlan>();
    const buildPlan = (tipo: ImportacaoTipo): ExecutionEntityPlan => {
      const existing = entityMap.get(tipo);
      if (existing) return existing;
      const plan: ExecutionEntityPlan = {
        entity: tipo,
        rows: 0,
        creates: 0,
        updates: 0,
        unchanged: 0,
        conflicts: 0,
        invalid: 0,
        skipped: 0,
        sample: [],
        errors: [],
      };
      entityMap.set(tipo, plan);
      return plan;
    };
    for (const row of rows) {
      const plan = buildPlan(record.tipo!);
      plan.rows++;
      const issues = row.issues.map((i) => ({
        code: i.code,
        message: i.message,
        row: i.row,
      }));
      if (row.action === 'CREATE') plan.creates++;
      else if (row.action === 'UPDATE') plan.updates++;
      else if (row.action === 'IGNORE') plan.unchanged++;
      else {
        const isConflict = row.issues.some((i) =>
          ['FILE_DUPLICATE', 'DATABASE_DUPLICATE', 'AMBIGUOUS_KEY', 'PARENT_CONFLICT', 'REQUIRE_REVIEW'].includes(
            i.code,
          ),
        );
        if (isConflict) plan.conflicts++;
        else plan.invalid++;
      }
      if (issues.length) plan.errors.push(...issues);
      if (plan.sample.length < 5) {
        plan.sample.push({
          row: row.row,
          state: toExecutionState(row.action, row.issues),
          entityId: row.existingId ?? null,
          key: row.key ?? null,
          diffs: row.fieldDiffs ?? [],
          skippedByPolicy: row.skippedByPolicy ?? [],
        });
      }
    }
    const entities = Array.from(entityMap.values());
    const fileType = record.classificacaoArquivo ?? null;
    return { importId: id, entities, fileType };
  }
  async execute(actor: AuthContext, id: string, meta: RequestMetadata) {
    this.allow(actor, 'importacoes.execute');
    const record = await this.record(id);
    if (record.tipo === 'TABELAS_COMERCIAIS')
      this.allow(actor, 'tabelas_comerciais.import');
    if (
      !record.validadaEm ||
      record.registrosValidos === null ||
      record.registrosValidos <= 0
    )
      throw fail(
        'IMPORTACAO_CONFLICT',
        'A importaÃ§Ã£o nÃ£o possui linhas vÃ¡lidas para executar',
        409,
      );
    const claimed = await this.db.importacao.updateMany({
      where: { id, status: 'PRONTA' },
      data: { status: 'PROCESSANDO', registrosProcessados: 0 },
    });
    if (claimed.count !== 1)
      throw fail(
        'IMPORTACAO_CONFLICT',
        'ImportaÃ§Ã£o nÃ£o estÃ¡ pronta ou jÃ¡ estÃ¡ sendo processada',
        409,
      );
    await this.audit(
      'IMPORTACAO_CONFIRMED',
      actor,
      id,
      { tipo: record.tipo, estrategia: record.estrategia },
      meta,
    );
    await this.audit(
      'IMPORTACAO_STARTED',
      actor,
      id,
      { tipo: record.tipo, lote: batchSize },
      meta,
    );
    try {
      const planRows = await this.analyze(record, record.estrategia!);
      const entityFailures = new Set<ImportacaoTipo>();
      let created = 0,
        updated = 0,
        concurrencySkips = 0;
      const writable = planRows.filter(
        (r) => r.action === 'CREATE' || r.action === 'UPDATE',
      );
      for (let start = 0; start < writable.length; start += batchSize) {
        const batch = writable.slice(start, start + batchSize);
        await this.db.$transaction(async (tx) => {
          for (const item of batch) {
            if (record.tipo !== 'ADMINISTRADORAS') {
              const parent = parentOf(record.tipo!);
              if (parent && entityFailures.has(parent)) {
                continue;
              }
            }
            if (item.action === 'UPDATE' && item.existingId) {
              const liveRecord = await fetchDomainCurrentRecord(tx, record.tipo!, item.existingId);
              if (!liveRecord) {
                concurrencySkips++;
                continue;
              }
              if (item.currentData && item.skippedByPolicy) {
                const changedFields = Object.keys(item.currentData).filter(
                  (f) => f !== 'id' && f !== 'createdAt' && f !== 'updatedAt',
                );
                const conflicts = detectConcurrencyChanges(
                  item.currentData,
                  liveRecord,
                  changedFields,
                );
                if (conflicts.length > 0) {
                  concurrencySkips++;
                  continue;
                }
              }
            }
            await persistDomainRecord(tx, record.tipo!, item, {
              actorId: actor.user.id,
              sourceMetadata: { importacaoId: id },
              meta,
            });
            if (item.action === 'CREATE') created++;
            else updated++;
          }
          await tx.importacao.update({
            where: { id },
            data: {
              registrosProcessados: Math.min(
                start + batch.length,
                writable.length,
              ),
              registrosCriados: created,
              registrosAtualizados: updated,
            },
          });
        });
      }
      const invalid = planRows.filter((r) => r.action === 'ERROR').length;
      const hasErrors = invalid > 0 || concurrencySkips > 0;
      const status = hasErrors ? 'CONCLUIDA_COM_ERROS' : 'CONCLUIDA';
      getBusinessMetrics().recordImport(
        status === 'CONCLUIDA' ? 'completed' : 'partial',
        planRows.length,
      );
      const finished = await this.db.importacao.update({
        where: { id },
        data: {
          status,
          finalizadaEm: new Date(),
          registrosProcessados: planRows.length,
          registrosCriados: created,
          registrosAtualizados: updated,
          registrosIgnorados: planRows.filter((r) => r.action === 'IGNORE').length,
          arquivoTemporario: null,
        },
        select,
      });
      if (record.arquivoTemporario)
        await unlink(record.arquivoTemporario).catch(() => undefined);
      await this.audit(
        'IMPORTACAO_COMPLETED',
        actor,
        id,
        {
          tipo: record.tipo,
          estrategia: record.estrategia,
          criados: created,
          atualizados: updated,
          invalidos: invalid,
          concorrenciaSkipped: concurrencySkips,
        },
        meta,
      );
      return dto(finished);
    } catch (error) {
      await this.db.importacao.update({
        where: { id },
        data: {
          status: 'FALHOU',
          finalizadaEm: new Date(),
          erroResumo:
            error instanceof Error
              ? error.message.slice(0, 2000)
              : 'Falha de processamento',
          arquivoTemporario: null,
        },
      });
      if (record.arquivoTemporario)
        await unlink(record.arquivoTemporario).catch(() => undefined);
      await this.audit(
        'IMPORTACAO_FAILED',
        actor,
        id,
        { tipo: record.tipo, etapa: 'PROCESSAMENTO' },
        meta,
      );
      throw error;
    }
  }
  async issues(actor: AuthContext, id: string, query: ImportacaoIssueQuery) {
    this.allow(actor, 'importacoes.read');
    await this.record(id);
    const where = { importacaoId: id };
    const [items, total] = await Promise.all([
      this.db.dataQualityIssue.findMany({
        where,
        orderBy: [{ linha: 'asc' }, { createdAt: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          linha: true,
          campo: true,
          valorRecebido: true,
          codigo: true,
          severidade: true,
          mensagem: true,
          createdAt: true,
        },
      }),
      this.db.dataQualityIssue.count({ where }),
    ]);
    return {
      items: items.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total ? Math.ceil(total / query.pageSize) : 0,
    };
  }
}