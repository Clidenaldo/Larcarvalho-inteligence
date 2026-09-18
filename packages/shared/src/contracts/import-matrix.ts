import { z } from 'zod';

export const importacaoTipos = [
  'ADMINISTRADORAS',
  'PRODUTOS',
  'GRUPOS',
  'COTAS',
  'ASSEMBLEIAS',
  'LANCES',
  'CONTEMPLACOES',
  'TABELAS_COMERCIAIS',
] as const;
export type ImportacaoTipo = (typeof importacaoTipos)[number];

export const importacaoFields = {
  ADMINISTRADORAS: [
    'nome',
    'nomeFantasia',
    'cnpj',
    'codigoExterno',
    'site',
    'ativa',
  ],
  PRODUTOS: [
    'administradoraId',
    'administradoraCnpj',
    'administradoraCodigoExterno',
    'nome',
    'categoria',
    'descricao',
    'codigoExterno',
    'ativo',
  ],
  GRUPOS: [
    'administradoraId',
    'administradoraCnpj',
    'administradoraCodigoExterno',
    'produtoId',
    'produtoCodigoExterno',
    'codigo',
    'status',
    'dataInicio',
    'dataEncerramento',
    'prazoMeses',
    'quantidadeCotas',
    'valorCreditoMinimo',
    'valorCreditoMaximo',
  ],
  COTAS: [
    'grupoId',
    'grupoCodigo',
    'administradoraId',
    'administradoraCnpj',
    'numero',
    'status',
    'valorCredito',
    'prazoRestante',
    'parcelaAtual',
    'codigoExterno',
  ],
  ASSEMBLEIAS: [
    'grupoId',
    'grupoCodigo',
    'administradoraId',
    'administradoraCnpj',
    'numero',
    'dataAssembleia',
    'status',
  ],
  LANCES: [
    'assembleiaId',
    'assembleiaNumero',
    'grupoId',
    'grupoCodigo',
    'administradoraId',
    'administradoraCnpj',
    'cotaId',
    'cotaNumero',
    'tipo',
    'percentual',
    'valor',
    'contemplado',
    'origem',
  ],
  CONTEMPLACOES: [
    'assembleiaId',
    'assembleiaNumero',
    'grupoId',
    'grupoCodigo',
    'administradoraId',
    'administradoraCnpj',
    'cotaId',
    'cotaNumero',
    'tipo',
    'codigoExterno',
    'valorLance',
    'percentualLance',
  ],
  TABELAS_COMERCIAIS: [
    'tabelaCodigo',
    'tabelaNome',
    'administradoraId',
    'administradoraCnpj',
    'produtoId',
    'categoria',
    'codigoExterno',
    'creditoReferencia',
    'seguro',
    'taxaAntecipadaValor',
    'taxaAntecipadaPercentual',
    'prazoMeses',
    'modalidade',
    'primeiraParcela',
    'demaisParcelas',
    'parcelaPadrao',
    'fundoReservaPercentual',
    'taxaAdministracaoPercentual',
    'taxaTotalPercentual',
    'seguroVidaPercentual',
    'participantesGrupo',
    'codigoPlano',
    'inicioVigencia',
  ],
} as const satisfies Record<ImportacaoTipo, readonly string[]>;

export const importacaoRequiredFields = {
  ADMINISTRADORAS: ['nome'],
  PRODUTOS: ['nome', 'categoria'],
  GRUPOS: ['codigo', 'status'],
  COTAS: ['numero', 'status'],
  ASSEMBLEIAS: ['dataAssembleia', 'status'],
  LANCES: ['tipo', 'origem'],
  CONTEMPLACOES: ['tipo'],
  TABELAS_COMERCIAIS: [
    'tabelaCodigo',
    'categoria',
    'creditoReferencia',
    'prazoMeses',
    'modalidade',
    'inicioVigencia',
  ],
} as const;

export const arquivoTipos = [
  'COMMERCIAL_TABLE',
  'GROUP_PORTFOLIO',
  'QUOTA_PORTFOLIO',
  'ASSEMBLY_HISTORY',
  'MIXED',
] as const;
export const arquivoTipoSchema = z.enum(arquivoTipos);
export type ArquivoTipo = z.infer<typeof arquivoTipoSchema>;

/**
 * Matriz de destino (item 2.1): cada classificação de arquivo declara
 * explicitamente quais entidades de destino são permitidas. Em especial:
 * - COMMERCIAL_TABLE nunca oferece Grupo/Cota/Assembleia;
 * - GROUP_PORTFOLIO nunca oferece TabelaComercial;
 * - QUOTA_PORTFOLIO nunca oferece Lance/Contemplação sem dado explícito;
 * - MIXED libera todos os destinos (um import por entidade).
 */
export const MATRIZ_DESTINO: Readonly<Record<ArquivoTipo, readonly ImportacaoTipo[]>> =
  Object.freeze({
    COMMERCIAL_TABLE: Object.freeze(['ADMINISTRADORAS', 'PRODUTOS', 'TABELAS_COMERCIAIS'] as const),
    GROUP_PORTFOLIO: Object.freeze(['ADMINISTRADORAS', 'PRODUTOS', 'GRUPOS'] as const),
    QUOTA_PORTFOLIO: Object.freeze(['ADMINISTRADORAS', 'PRODUTOS', 'GRUPOS', 'COTAS'] as const),
    ASSEMBLY_HISTORY: Object.freeze([
      'ADMINISTRADORAS',
      'GRUPOS',
      'ASSEMBLEIAS',
      'LANCES',
      'CONTEMPLACOES',
    ] as const),
    MIXED: Object.freeze([
      'ADMINISTRADORAS',
      'PRODUTOS',
      'GRUPOS',
      'COTAS',
      'ASSEMBLEIAS',
      'LANCES',
      'CONTEMPLACOES',
      'TABELAS_COMERCIAIS',
    ] as const),
  });

export function destinationsForFileType(tipo: ArquivoTipo): readonly ImportacaoTipo[] {
  return MATRIZ_DESTINO[tipo];
}

export function isCompatibleTarget(
  arquivoTipo: ArquivoTipo,
  destino: ImportacaoTipo,
): boolean {
  return MATRIZ_DESTINO[arquivoTipo].includes(destino);
}

export type ImportTargetDataType =
  | 'string'
  | 'decimal'
  | 'integer'
  | 'date'
  | 'datetime'
  | 'boolean'
  | 'enum'
  | 'cnpj'
  | 'email';

/**
 * Política de sobrescrita em UPDATE (item 15, aplicada de verdade):
 * - update: sobrescreve com o valor do arquivo;
 * - fill_empty: só preenche quando o valor atual está vazio (protege
 *   dado manual já preenchido sem travar a primeira carga);
 * - never: nunca escrito em UPDATE (chaves e identificadores);
 * - review: reservado para revisão explícita futura (sem atribuição
 *   padrão; ver docs/IMPORT_EXECUTION.md).
 */
export type ImportOverwritePolicy = 'update' | 'fill_empty' | 'never' | 'review';

export interface ImportTargetField {
  readonly acceptedFileTypes: readonly ArquivoTipo[];
  readonly aliases: readonly string[];
  readonly dataType: ImportTargetDataType;
  readonly naturalKey: boolean;
  readonly overwritePolicy: ImportOverwritePolicy;
  readonly required: boolean;
  readonly supportsAutomaticSuggestion: boolean;
  readonly supportsManualMapping: boolean;
}

const FILL_EMPTY_FIELDS: ReadonlySet<string> = new Set([
  'nomeFantasia',
  'descricao',
  'site',
]);

const NEVER_OVERWRITE_FIELDS: ReadonlySet<string> = new Set([
  'cnpj',
  'administradoraCnpj',
  'codigo',
  'numero',
  'grupoCodigo',
  'cotaNumero',
  'assembleiaNumero',
  'tabelaCodigo',
  'produtoCodigoExterno',
  'codigoExterno',
  'administradoraCodigoExterno',
  'administradoraId',
  'produtoId',
  'grupoId',
  'assembleiaId',
  'cotaId',
]);

function overwritePolicyOf(field: string): ImportOverwritePolicy {
  if (NEVER_OVERWRITE_FIELDS.has(field)) return 'never';
  if (FILL_EMPTY_FIELDS.has(field)) return 'fill_empty';
  return 'update';
}

const DECIMAL_FIELDS: ReadonlySet<string> = new Set([
  'valorCreditoDesejado',
  'parcelaMaxima',
  'valorCredito',
  'prazoRestante',
  'parcelaAtual',
  'valor',
  'percentual',
  'valorLance',
  'percentualLance',
  'creditoReferencia',
  'seguro',
  'taxaAntecipadaValor',
  'taxaAntecipadaPercentual',
  'fundoReservaPercentual',
  'taxaAdministracaoPercentual',
  'taxaTotalPercentual',
  'seguroVidaPercentual',
  'valorCreditoMinimo',
  'valorCreditoMaximo',
]);

const INTEGER_FIELDS: ReadonlySet<string> = new Set([
  'prazoMeses',
  'quantidadeCotas',
  'prazoMinimo',
  'prazoMaximo',
  'participantesGrupo',
  'numero',
  'assembleiaNumero',
]);

const DATE_FIELDS: ReadonlySet<string> = new Set([
  'dataInicio',
  'dataEncerramento',
  'dataAssembleia',
  'inicioVigencia',
]);

const BOOLEAN_FIELDS: ReadonlySet<string> = new Set(['ativa', 'ativo', 'contemplado']);

const ENUM_FIELDS: ReadonlySet<string> = new Set([
  'categoria',
  'modalidade',
  'status',
  'tipo',
  'origem',
]);

const NATURAL_KEYS: ReadonlySet<string> = new Set([
  'cnpj',
  'administradoraCnpj',
  'codigo',
  'numero',
  'grupoCodigo',
  'cotaNumero',
  'assembleiaNumero',
  'tabelaCodigo',
  'produtoCodigoExterno',
  'codigoExterno',
  'administradoraCodigoExterno',
]);

const FIELD_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  numero: ['numero cota', 'nº cota', 'num cota'],
  grupoCodigo: ['grupo', 'codigo grupo', 'cód. grupo'],
  cotaNumero: ['cota'],
  tabelaCodigo: ['tabela', 'codigo tabela', 'cód. tabela'],
  administradoraCodigoExterno: ['administradora', 'codigo administradora'],
  valorCredito: ['valor credito', 'crédito', 'vl. crédito'],
  dataAssembleia: ['data assembleia', 'assembleia'],
  produtoCodigoExterno: ['codigo produto'],
  valorLance: ['valor do lance'],
  percentualLance: ['percentual lance', '% lance'],
});

function dataTypeOf(field: string): ImportTargetDataType {
  if (DECIMAL_FIELDS.has(field)) return 'decimal';
  if (INTEGER_FIELDS.has(field)) return 'integer';
  if (DATE_FIELDS.has(field)) return 'date';
  if (BOOLEAN_FIELDS.has(field)) return 'boolean';
  if (ENUM_FIELDS.has(field)) return 'enum';
  if (field === 'cnpj' || field === 'administradoraCnpj') return 'cnpj';
  if (field === 'email') return 'email';
  return 'string';
}

/**
 * Registry central de campos importáveis (item 2.3): cada campo está
 * vinculado a uma entidade real, com tipos de arquivo aceitos, aliases,
 * tipo de dado, obrigatoriedade, participação em chave natural, política
 * de sobrescrita e suporte a mapeamento manual/automático.
 */
export type ImportTargetRegistry = Readonly<
  Record<ImportacaoTipo, Readonly<Record<string, ImportTargetField>>>
>;

function fileTypesForEntity(tipo: ImportacaoTipo): readonly ArquivoTipo[] {
  return (Object.keys(MATRIZ_DESTINO) as ArquivoTipo[]).filter((arquivo) =>
    MATRIZ_DESTINO[arquivo].includes(tipo),
  );
}

function buildRegistry(): ImportTargetRegistry {
  const registry = {} as Record<ImportacaoTipo, Record<string, ImportTargetField>>;
  for (const tipo of Object.keys(importacaoFields) as ImportacaoTipo[]) {
    const required = new Set<string>(importacaoRequiredFields[tipo] ?? []);
    const fields = {} as Record<string, ImportTargetField>;
    for (const field of importacaoFields[tipo]) {
      fields[field] = Object.freeze({
        acceptedFileTypes: fileTypesForEntity(tipo),
        aliases: FIELD_ALIASES[field] ?? [],
        dataType: dataTypeOf(field),
        naturalKey: NATURAL_KEYS.has(field),
        overwritePolicy: overwritePolicyOf(field),
        required: required.has(field),
        supportsAutomaticSuggestion: true,
        supportsManualMapping: true,
      });
    }
    registry[tipo] = Object.freeze(fields);
  }
  return Object.freeze(registry);
}

export const IMPORT_TARGET_REGISTRY: ImportTargetRegistry = buildRegistry();

/**
 * Campos que NUNCA podem ser preenchidos por importação genérica
 * (item 2.4): nunca aparecem como opção de mapping.
 */
export const NEVER_IMPORTABLE_FIELDS: readonly string[] = Object.freeze([
  'id',
  'createdAt',
  'updatedAt',
  'passwordHash',
  'token',
  'tokenHash',
  'permission',
  'permissions',
  'aderencia',
  'indiceAderencia',
  'score',
]);

/**
 * Cabeçalhos genéricos que NUNCA disparam mapeamento automático
 * (item 2.2): "Prazo", "Taxa", "Parcela", "Crédito", "Valor" e "Lance"
 * sozinhos podem significar campos distintos conforme o documento.
 * Exigem contexto (tipo do arquivo + revisão explícita).
 */
export const GENERIC_AMBIGUOUS_STEMS: readonly string[] = Object.freeze([
  'prazo',
  'prazos',
  'taxa',
  'taxas',
  'parcela',
  'parcelas',
  'credito',
  'creditos',
  'valor',
  'valores',
  'lance',
  'lances',
]);

export type ClassificacaoArquivo = ArquivoTipo;
export const classificacaoArquivoSchema = arquivoTipoSchema;
