import {
  GENERIC_AMBIGUOUS_STEMS,
  IMPORT_TARGET_REGISTRY,
  MATRIZ_DESTINO,
  NEVER_IMPORTABLE_FIELDS,
  destinationsForFileType,
  importacaoFields,
  importacaoRequiredFields,
  isCompatibleTarget,
} from '@larcarvalho/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  diffUpdate,
  toExecutionState,
} from '../src/modules/importacoes/import-execution.js';

import type { AuthContext } from '../src/core/auth/auth-context.js';
import {
  autoMapColumns,
  needsReviewColumns,
} from '../src/modules/importacoes/import-file.js';
import { ImportacoesService } from '../src/modules/importacoes/importacoes.service.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';

function actor(
  role: AuthContext['user']['role'] = 'ADMIN',
): AuthContext {
  return {
    sessionId: 'session-import-matrix',
    teamIds: [],
    user: {
      email: 'admin@larcarvalho.com.br',
      id: '00000000-0000-4000-8000-000000000001',
      nome: 'Admin',
      role,
    },
  };
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    abaSelecionada: 'Aba1',
    abas: ['Aba1'],
    arquivoTemporario: null,
    colunas: [],
    createdAt: new Date(),
    criadoPor: null,
    criadoPorId: null,
    erroResumo: null,
    estrategia: null,
    finalizadaEm: null,
    id: '00000000-0000-4000-8000-000000000002',
    iniciadaEm: new Date(),
    mapeamento: null,
    mapeamentoConfirmado: false,
    mimeType: 'text/csv',
    nomeArquivo: 'arquivo.csv',
    registrosAtualizados: 0,
    registrosComAviso: 0,
    registrosCriados: 0,
    registrosIgnorados: 0,
    registrosInvalidos: 0,
    registrosProcessados: 0,
    registrosValidos: 0,
    totalRegistros: 0,
    updatedAt: new Date(),
    validadaEm: null,
    classificacaoArquivo: null,
    status: 'PENDENTE',
    tamanhoBytes: 10,
    tipo: 'GRUPOS',
    ...overrides,
  };
}

function serviceWith(recordValue: Record<string, unknown>) {
  const tx = { auditLog: { create: vi.fn().mockResolvedValue({}) } };
  const db = {
    $transaction: vi.fn(async (ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops) : (ops as (tx: unknown) => Promise<unknown>)(tx),
    ),
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    importacao: {
      findUnique: vi.fn().mockResolvedValue(recordValue),
      update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...recordValue,
        ...data,
      })),
    },
  } as unknown as PrismaClient;
  return { db, service: new ImportacoesService(db) };
}

describe('matriz de destino da importação (73.1)', () => {
  it('COMMERCIAL_TABLE não oferece Grupo.codigo como destino', () => {
    expect(destinationsForFileType('COMMERCIAL_TABLE')).not.toContain('GRUPOS');
    expect(isCompatibleTarget('COMMERCIAL_TABLE', 'GRUPOS')).toBe(false);
  });

  it('COMMERCIAL_TABLE não cria Cota', () => {
    expect(isCompatibleTarget('COMMERCIAL_TABLE', 'COTAS')).toBe(false);
  });

  it('COMMERCIAL_TABLE não cria Assembleia', () => {
    expect(isCompatibleTarget('COMMERCIAL_TABLE', 'ASSEMBLEIAS')).toBe(false);
  });

  it('GROUP_PORTFOLIO não cria TabelaComercial', () => {
    expect(isCompatibleTarget('GROUP_PORTFOLIO', 'TABELAS_COMERCIAIS')).toBe(false);
    expect(destinationsForFileType('GROUP_PORTFOLIO')).toEqual(
      expect.arrayContaining(['ADMINISTRADORAS', 'PRODUTOS', 'GRUPOS']),
    );
  });

  it('QUOTA_PORTFOLIO não cria Contemplação sem dado explícito', () => {
    expect(isCompatibleTarget('QUOTA_PORTFOLIO', 'CONTEMPLACOES')).toBe(false);
    expect(isCompatibleTarget('QUOTA_PORTFOLIO', 'LANCES')).toBe(false);
    expect(isCompatibleTarget('QUOTA_PORTFOLIO', 'COTAS')).toBe(true);
  });

  it('ASSEMBLY_HISTORY não cria Cota fictícia', () => {
    expect(isCompatibleTarget('ASSEMBLY_HISTORY', 'COTAS')).toBe(false);
    expect(isCompatibleTarget('ASSEMBLY_HISTORY', 'TABELAS_COMERCIAIS')).toBe(false);
    expect(isCompatibleTarget('ASSEMBLY_HISTORY', 'ASSEMBLEIAS')).toBe(true);
  });

  it('MIXED aceita destinos de múltiplas entidades permitidas', () => {
    for (const destino of [
      'GRUPOS',
      'COTAS',
      'ASSEMBLEIAS',
      'TABELAS_COMERCIAIS',
    ] as const)
      expect(isCompatibleTarget('MIXED', destino)).toBe(true);
    expect(MATRIZ_DESTINO.MIXED).toHaveLength(8);
  });

  it('mapping manual semanticamente incompatível é rejeitado pelo backend', async () => {
    const { service } = serviceWith(
      record({ classificacaoArquivo: 'COMMERCIAL_TABLE', tipo: 'GRUPOS' }),
    );
    await expect(
      service.saveMapping(actor(), 'import-1', { mapeamento: { codigo: 'Grupo' } }, {
        ipAddress: '127.0.0.1',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_IMPORT_TARGET', statusCode: 400 });
  });

  it('campo interno/sistema nunca aparece como destino', () => {
    const registryFields = new Set<string>();
    for (const entity of Object.values(IMPORT_TARGET_REGISTRY))
      for (const field of Object.keys(entity)) registryFields.add(field);
    for (const forbidden of NEVER_IMPORTABLE_FIELDS) {
      expect(registryFields.has(forbidden)).toBe(false);
      for (const fields of Object.values(importacaoFields))
        expect((fields as readonly string[]).includes(forbidden)).toBe(false);
    }
    expect(NEVER_IMPORTABLE_FIELDS).toContain('aderencia');
  });

  it('coluna ambígua "Prazo" exige contexto ou revisão', () => {
    expect(autoMapColumns('GRUPOS', ['Prazo'])).toEqual({});
    expect(autoMapColumns('COTAS', ['Prazo'])).toEqual({});
    expect(needsReviewColumns('GRUPOS', ['Prazo', 'Código'])).toContain('Prazo');
    expect(GENERIC_AMBIGUOUS_STEMS).toContain('prazo');
  });

  it('coluna "Taxa" não é automaticamente mapeada sem determinar qual taxa', () => {
    expect(
      autoMapColumns('TABELAS_COMERCIAIS', ['Taxa', 'Tabela', 'Categoria']),
    ).toEqual({ tabelaCodigo: 'Tabela', categoria: 'Categoria' });
    expect(needsReviewColumns('TABELAS_COMERCIAIS', ['Taxa'])).toContain('Taxa');
  });

  it('mudança do tipo do arquivo recalcula destinos disponíveis', () => {
    expect(destinationsForFileType('COMMERCIAL_TABLE')).toEqual(
      expect.arrayContaining(['TABELAS_COMERCIAIS']),
    );
    expect(destinationsForFileType('GROUP_PORTFOLIO')).not.toContain(
      'TABELAS_COMERCIAIS',
    );
    expect(destinationsForFileType('GROUP_PORTFOLIO')).not.toContain('COTAS');
    expect(destinationsForFileType('QUOTA_PORTFOLIO')).toContain('COTAS');
  });

  it('perfil salvo incompatível com novo tipo não é aplicado cegamente', async () => {
    const { db, service } = serviceWith(
      record({
        classificacaoArquivo: 'COMMERCIAL_TABLE',
        mapeamento: { codigo: 'Grupo' },
        mapeamentoConfirmado: true,
        status: 'PRONTA',
        tipo: 'GRUPOS',
      }),
    );
    const updated = await service.classify(
      actor(),
      'import-1',
      { classificacaoArquivo: 'GROUP_PORTFOLIO' },
      { ipAddress: '127.0.0.1' },
    );
    const update = db.importacao.update as unknown as {
      mock: { calls: [{ data: Record<string, unknown> }][] };
    };
    expect(update.mock.calls[0]?.[0].data).toMatchObject({
      classificacaoArquivo: 'GROUP_PORTFOLIO',
      mapeamentoConfirmado: false,
      status: 'PENDENTE',
    });
    expect(updated).toBeDefined();
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'IMPORTACAO_CLASSIFIED' }),
      }),
    );
  });

  it('cada campo importável está vinculado a uma entidade real', () => {
    for (const [tipo, fields] of Object.entries(importacaoFields)) {
      const registry = IMPORT_TARGET_REGISTRY[tipo as keyof typeof IMPORT_TARGET_REGISTRY];
      expect(Object.keys(registry).sort()).toEqual([...(fields as readonly string[])].sort());
      for (const [field, definition] of Object.entries(registry)) {
        expect(definition.acceptedFileTypes.length).toBeGreaterThan(0);
        expect(definition.supportsManualMapping).toBe(true);
        expect(
          (importacaoRequiredFields[tipo as keyof typeof importacaoRequiredFields] as readonly string[]).includes(
            field,
          ),
        ).toBe(definition.required);
      }
    }
  });

  it('upload com par incompatível é rejeitado na origem', async () => {
    const { service } = serviceWith(record({}));
    await expect(
      service.upload(
        actor(),
        {
          bytes: Buffer.from('a,b\n1,2'),
          classificacaoArquivo: 'COMMERCIAL_TABLE',
          filename: 'grupos.csv',
          mime: 'text/csv',
          tipo: 'GRUPOS',
        },
        { ipAddress: '127.0.0.1' },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_IMPORT_TARGET', statusCode: 400 });
  });
});

describe('import-execution helpers (items 13–16)', () => {
  it('toExecutionState mapeia CREATE, UPDATE, IGNORE', () => {
    expect(toExecutionState('CREATE', [])).toBe('CREATE');
    expect(toExecutionState('UPDATE', [])).toBe('UPDATE');
    expect(toExecutionState('IGNORE', [])).toBe('UNCHANGED');
  });

  it('toExecutionState detecta CONFLICT via FILE_DUPLICATE', () => {
    expect(
      toExecutionState('ERROR', [
        { code: 'FILE_DUPLICATE', message: 'dup', row: 2, severity: 'ERROR' },
      ]),
    ).toBe('CONFLICT');
  });

  it('toExecutionState detecta CONFLICT via DATABASE_DUPLICATE', () => {
    expect(
      toExecutionState('ERROR', [
        { code: 'DATABASE_DUPLICATE', message: 'dup', row: 2, severity: 'ERROR' },
      ]),
    ).toBe('CONFLICT');
  });

  it('toExecutionState retorna INVALID para erros genéricos', () => {
    expect(
      toExecutionState('ERROR', [
        { code: 'REFERENCE_NOT_FOUND', message: 'ref', row: 2, severity: 'ERROR' },
      ]),
    ).toBe('INVALID');
  });

  it('diffUpdate aplica policy update para campos genéricos', () => {
    const { diffs, effectiveData, skippedByPolicy } = diffUpdate(
      'ADMINISTRADORAS',
      { nome: 'Novo Nome', cnpj: '11.222.333/0001-99' },
      { nome: 'Nome Antigo', cnpj: '11.222.333/0001-81' },
    );
    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.field).toBe('nome');
    expect(diffs[0]?.changed).toBe(true);
    expect(diffs[0]?.from).toBe('Nome Antigo');
    expect(diffs[0]?.to).toBe('Novo Nome');
    expect(diffs[0]?.policy).toBe('update');
    expect(skippedByPolicy).toContain('cnpj');
    expect(effectiveData).toHaveProperty('nome', 'Novo Nome');
    expect(effectiveData).not.toHaveProperty('cnpj');
  });

  it('diffUpdate aplica policy fill_empty só quando vazio', () => {
    const { diffs, skippedByPolicy } = diffUpdate(
      'ADMINISTRADORAS',
      { nomeFantasia: 'Fantasia' },
      { nomeFantasia: 'Existente' },
    );
    expect(diffs).toHaveLength(0);
    expect(skippedByPolicy).toContain('nomeFantasia');

    const filled = diffUpdate(
      'ADMINISTRADORAS',
      { nomeFantasia: 'Fantasia' },
      { nomeFantasia: null },
    );
    expect(filled.diffs).toHaveLength(1);
    expect(filled.diffs[0]?.to).toBe('Fantasia');
  });

  it('diffUpdate ignora never para chaves como cnpj', () => {
    const { effectiveData, skippedByPolicy } = diffUpdate(
      'ADMINISTRADORAS',
      { cnpj: 'novo', codigoExterno: 'ext-novo' },
      { cnpj: 'antigo', codigoExterno: 'ext-antigo' },
    );
    expect(skippedByPolicy).toContain('cnpj');
    expect(skippedByPolicy).toContain('codigoExterno');
    expect(effectiveData).not.toHaveProperty('cnpj');
    expect(effectiveData).not.toHaveProperty('codigoExterno');
  });

  it('policy overwritePolicy está definida para todos os campos do registry', () => {
    for (const [_tipo, fields] of Object.entries(IMPORT_TARGET_REGISTRY)) {
      for (const [_field, definition] of Object.entries(fields)) {
        expect(['update', 'fill_empty', 'never', 'review']).toContain(
          definition.overwritePolicy,
        );
        expect(definition.acceptedFileTypes.length).toBeGreaterThan(0);
      }
    }
  });
});
