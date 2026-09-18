import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { ImportacoesService } from '../src/modules/importacoes/importacoes.service.js';
import { parseImportFile } from '../src/modules/importacoes/import-file.js';

const path = fileURLToPath(
  new URL('./fixtures/vwa-original.csv', import.meta.url),
);
const historicalMapping = {
  nome: 'tabelaNome',
  categoria: 'categoria',
  codigoExterno: 'codigoExterno',
  administradoraCnpj: 'administradoraCnpj',
  administradoraCodigoExterno: 'tabelaCodigo',
};
type Prepared = {
  row: number;
  key?: string;
  action: string;
  issues: { code: string }[];
};

function harness() {
  const productLookup = vi.fn().mockResolvedValue([]);
  const service = new ImportacoesService({
    administradora: {
      findMany: vi.fn().mockResolvedValue([{ id: 'admin-vwa' }]),
      findUnique: vi.fn().mockResolvedValue({ id: 'admin-vwa' }),
    },
    produto: { findMany: productLookup },
  } as unknown as PrismaClient);
  const diagnostic = service as unknown as {
    analyze(
      record: Record<string, unknown>,
      strategy: string,
    ): Promise<Prepared[]>;
    parsed(): Promise<ReturnType<typeof parseImportFile>>;
  };
  const record = {
    tipo: 'PRODUTOS',
    classificacaoArquivo: 'COMMERCIAL_TABLE',
    nomeArquivo: 'VWA_Tabela_Acesso_FINAL_importacao.csv',
    mimeType: 'text/csv',
    arquivoTemporario: path,
    mapeamentoConfirmado: true,
    mapeamento: historicalMapping,
  };
  return { diagnostic, record, productLookup };
}
function counts(rows: Prepared[]) {
  const issues = rows.flatMap((row) => row.issues);
  return {
    FILE_DUPLICATE: issues.filter((issue) => issue.code === 'FILE_DUPLICATE')
      .length,
    IGNORE: rows.filter((row) => row.action === 'IGNORE').length,
    PARENT_CONFLICT: issues.filter((issue) => issue.code === 'PARENT_CONFLICT')
      .length,
    REQUIRE_REVIEW: issues.filter((issue) => issue.code === 'REQUIRE_REVIEW')
      .length,
  };
}

describe('VWA original file and repeated commercial parents', () => {
  it('rejects the historical product mapping before inventing 25 products from offer codes', async () => {
    const { diagnostic, record, productLookup } = harness();
    const rows = await diagnostic.analyze(record, 'IGNORAR');
    expect(rows).toHaveLength(150);
    expect(counts(rows)).toEqual({
      FILE_DUPLICATE: 0,
      IGNORE: 0,
      PARENT_CONFLICT: 0,
      REQUIRE_REVIEW: 300,
    });
    expect(rows.every((row) => row.action === 'ERROR')).toBe(true);
    expect(productLookup).not.toHaveBeenCalled();
  });

  it('retains 25 credit codes with six distinct commercial identities each, including VW028', async () => {
    const bytes = await readFile(path);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      'd94994baaffbb8cc009ce02cfb70c83dab1b04f91b7bbafb12014ef232633efa',
    );
    const parsed = parseImportFile('vwa.csv', 'text/csv', bytes);
    const groups = new Map<string, Set<string>>();
    for (const row of parsed.rows) {
      const code = String(row.codigoExterno);
      const identities = groups.get(code) ?? new Set<string>();
      identities.add(
        JSON.stringify([
          row.creditoReferencia,
          row.prazoMeses,
          row.modalidade,
          row.codigoPlano,
        ]),
      );
      groups.set(code, identities);
    }
    expect(parsed.rows).toHaveLength(150);
    expect(groups.size).toBe(25);
    expect(
      [...groups.values()].every((identities) => identities.size === 6),
    ).toBe(true);
    expect(groups.get('VW028')?.size).toBe(6);
  });

  // Explicit product identity is a separate control, not a modification of the VWA fixture.
  it.each([false, true])(
    'groups an explicit product identity; conflicting descriptions=%s',
    async (conflicting) => {
      const { diagnostic, record } = harness();
      const columns = [
        'nomeProduto',
        'categoriaProduto',
        'codigoProduto',
        'cnpjAdmin',
        'descricaoProduto',
      ];
      vi.spyOn(diagnostic, 'parsed').mockResolvedValue({
        columns,
        sheets: ['CSV'],
        selectedSheet: 'CSV',
        rows: Array.from({ length: 150 }, (_, index) => ({
          nomeProduto: 'Produto explicitamente identificado',
          categoriaProduto: 'AUTOMOVEL',
          codigoProduto: 'PRODUCT-1',
          cnpjAdmin: '47658539000104',
          descricaoProduto:
            conflicting && index === 149 ? 'Diferente' : 'Mesma descricao',
        })),
      });
      const rows = await diagnostic.analyze(
        {
          ...record,
          mapeamento: {
            nome: 'nomeProduto',
            categoria: 'categoriaProduto',
            codigoExterno: 'codigoProduto',
            administradoraCnpj: 'cnpjAdmin',
            descricao: 'descricaoProduto',
          },
        },
        'IGNORAR',
      );
      expect(counts(rows)).toEqual({
        FILE_DUPLICATE: 0,
        IGNORE: conflicting ? 0 : 149,
        PARENT_CONFLICT: conflicting ? 150 : 0,
        REQUIRE_REVIEW: 0,
      });
    },
  );
});
