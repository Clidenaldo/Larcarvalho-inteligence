import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import '../apps/backend/src/config/load-env.js';
import { PrismaClient } from '../apps/backend/src/generated/prisma/client.js';
import { ImportacoesService } from '../apps/backend/src/modules/importacoes/importacoes.service.js';
import { parseImportFile } from '../apps/backend/src/modules/importacoes/import-file.js';
import type { AuthContext } from '../apps/backend/src/core/auth/auth-context.js';

const out = resolve('output/vwa-diagnosis');
await mkdir(out, { recursive: true });
const filename = 'VWA_Tabela_Acesso_FINAL_importacao.csv';
const bytes = await readFile(
  process.env.VWA_CSV_PATH ??
    resolve('apps/backend/test/fixtures/vwa-original.csv'),
);
const parsed = parseImportFile(filename, 'text/csv', bytes);
const historicalId = '508fca77-02df-4a48-ab8e-2c4389113ccf';
const testUrl = new URL(process.env.TEST_DATABASE_URL!);
if (
  testUrl.pathname !== '/larcarvalho_test' ||
  !['localhost', '127.0.0.1'].includes(testUrl.hostname)
)
  throw new Error('Local test database required');
const mode = process.argv[2] ?? 'reproduce';
const save = async (name: string, value: unknown) =>
  writeFile(resolve(out, `${name}.json`), JSON.stringify(value, null, 2));

async function freshSchema(schema: string) {
  if (!/^vwa_[a-z0-9_]+$/.test(schema))
    throw new Error('Invalid diagnostic schema');
  const url = new URL(testUrl);
  url.searchParams.set('schema', schema);
  url.searchParams.set('options', `-csearch_path=${schema}`);
  const client = new pg.Client({ connectionString: testUrl.toString() });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
  } finally {
    await client.end();
  }
  const result = spawnSync(
    'npx.cmd',
    ['prisma', 'db', 'push', '--config', 'apps/backend/prisma.test.config.ts'],
    {
      shell: true,
      env: { ...process.env, TEST_DATABASE_URL: url.toString() },
      encoding: 'utf8',
    },
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  // Prisma's model does not represent the CHECK constraints installed by migrations.
  const checks = new pg.Client({ connectionString: testUrl.toString() });
  await checks.connect();
  try {
    const constraints = await checks.query<{
      table_name: string;
      name: string;
      definition: string;
    }>(
      "SELECT t.relname table_name,c.conname name,pg_get_constraintdef(c.oid) definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND c.contype='c'",
    );
    await checks.query("SELECT set_config('search_path', $1, false)", [schema]);
    const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
    for (const check of constraints.rows)
      await checks.query(
        `ALTER TABLE ${quote(schema)}.${quote(check.table_name)} ADD CONSTRAINT ${quote(check.name)} ${check.definition}`,
      );
  } finally {
    await checks.end();
  }
  return url.toString();
}

if (mode === 'regression') {
  const schema = `vwa_regression_${Date.now()}`;
  const url = await freshSchema(schema);
  await save('regression-schema', { schema });
  const env = { ...process.env, TEST_DATABASE_URL: url, DATABASE_URL: url };
  for (const [name, args, cwd] of [
    [
      'integration',
      [
        'vitest',
        'run',
        '--config',
        'vitest.integration.config.ts',
        'test/integration/importacoes.spec.ts',
        'test/integration/tabelas-comerciais.spec.ts',
      ],
      resolve('apps/backend'),
    ],
    [
      'playwright',
      [
        'playwright',
        'test',
        'tests/e2e/importacoes.spec.ts',
        'tests/e2e/tabelas-comerciais.spec.ts',
        '--project=chromium',
      ],
      resolve('.'),
    ],
  ] as const) {
    if (process.argv[3] && process.argv[3] !== name) continue;
    const result = spawnSync('npx.cmd', [...args], {
      shell: true,
      env,
      cwd,
      encoding: 'utf8',
      timeout: 900_000,
    });
    await writeFile(
      resolve(out, `${name}.log`),
      `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    );
    await save(`${name}-result`, {
      exitCode: result.status,
      error: result.error?.message,
    });
    console.log(name, 'exitCode', result.status);
    if (result.status !== 0) process.exitCode = 1;
  }
} else {
  const prod = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await prod.connect();
  let historical;
  try {
    await prod.query('BEGIN READ ONLY');
    const record = (
      await prod.query(
        'SELECT id,tipo,classificacao_arquivo,nome_arquivo,mapeamento,total_registros,registros_criados,registros_invalidos,created_at FROM importacoes WHERE id=$1',
        [historicalId],
      )
    ).rows[0];
    const issues = (
      await prod.query(
        'SELECT id,importacao_id,entidade,codigo,campo,linha,registro_id,valor_recebido,metadata,dedup_key,status,origem,mensagem,created_at FROM data_quality_issues WHERE importacao_id=$1 ORDER BY linha',
        [historicalId],
      )
    ).rows;
    const audit = (
      await prod.query(
        'SELECT action,metadata,created_at FROM audit_logs WHERE entity_id=$1 ORDER BY created_at',
        [historicalId],
      )
    ).rows;
    const admin = (
      await prod.query(
        "SELECT id,nome,cnpj,codigo_externo FROM administradoras WHERE cnpj='47658539000104'",
      )
    ).rows[0];
    const grouped = new Map<string, number>();
    for (const issue of issues) {
      const key = `${issue.codigo}|${issue.entidade}|${admin.id}:ext:${parsed.rows[issue.linha - 2]?.codigoExterno}`;
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    }
    historical = {
      record,
      issues,
      audit,
      admin,
      grouped: Object.fromEntries(grouped),
      csvSha256: createHash('sha256').update(bytes).digest('hex'),
    };
    await save(
      mode === 'reproduce' ? 'historical' : 'historical-after',
      historical,
    );
    await prod.query('ROLLBACK');
  } finally {
    await prod.end();
  }
  const oldPath = resolve(
    'apps/backend/dist/modules/importacoes/importacoes.service.js',
  );
  const oldSource = await readFile(oldPath, 'utf8');
  if (mode === 'reproduce' && oldSource.includes('const repeatedParent'))
    throw new Error(
      'Build already updated; use verify to preserve the old baseline evidence',
    );
  if (mode === 'verify' && !oldSource.includes('const repeatedParent'))
    throw new Error('Build is still missing repeatedParent');
  if (mode === 'reproduce')
    await save('code-evidence', {
      buildModifiedAt: (await stat(oldPath)).mtime.toISOString(),
      sourceModifiedAt: (
        await stat(
          resolve(
            'apps/backend/src/modules/importacoes/importacoes.service.ts',
          ),
        )
      ).mtime.toISOString(),
      buildSha256: createHash('sha256').update(oldSource).digest('hex'),
      repeatedParentInBuild: oldSource.includes('const repeatedParent'),
    });
  if (mode === 'reproduce')
    await writeFile(
      resolve(out, 'baseline-importacoes.service.js.txt'),
      oldSource,
    );
  const Legacy = (await import(pathToFileURL(oldPath).href)).ImportacoesService;
  const runId = Date.now();
  for (const [label, Constructor, tipo] of [
    [
      mode === 'reproduce' ? 'baseline' : 'rebuilt-products',
      Legacy,
      'PRODUTOS',
    ],
    [
      mode === 'reproduce' ? 'current-products' : 'verified-products',
      ImportacoesService,
      'PRODUTOS',
    ],
    [
      mode === 'reproduce' ? 'current-commercial' : 'verified-commercial',
      ImportacoesService,
      'TABELAS_COMERCIAIS',
    ],
  ] as const) {
    const schema = `vwa_${label.replaceAll('-', '_')}_${runId}`;
    const url = await freshSchema(schema);
    const pool = new pg.Pool({ connectionString: url });
    const db = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
    try {
      const user = await db.user.create({
        data: {
          nome: 'VWA Diagnostic',
          email: `vwa-${randomUUID()}@example.invalid`,
          passwordHash: 'disabled-diagnostic-user',
          role: 'SUPER_ADMIN',
        },
      });
      await db.administradora.create({
        data: {
          nome: historical.admin.nome,
          cnpj: historical.admin.cnpj,
          codigoExterno: historical.admin.codigo_externo,
        },
      });
      const actor: AuthContext = {
        sessionId: 'diagnostic',
        user: {
          id: user.id,
          nome: user.nome,
          email: user.email,
          role: user.role,
        },
      };
      const service = new Constructor(db);
      const uploaded = await service.upload(
        actor,
        { tipo, filename, mime: 'text/csv', bytes },
        {},
      );
      await service.classify(
        actor,
        uploaded.id,
        { classificacaoArquivo: 'COMMERCIAL_TABLE' },
        {},
      );
      const preview = await service.preview(actor, uploaded.id);
      const map =
        tipo === 'PRODUTOS'
          ? historical.record.mapeamento
          : Object.fromEntries(
              parsed.columns.map((column) => [column, column]),
            );
      await service.saveMapping(actor, uploaded.id, { mapeamento: map }, {});
      const validation = await service.validate(
        actor,
        uploaded.id,
        'IGNORAR',
        {},
      );
      const record = await db.importacao.findUniqueOrThrow({
        where: { id: uploaded.id },
      });
      // Observe the actual service result, without replacing any decision logic.
      const rows = await Reflect.get(service, 'analyze').call(
        service,
        record,
        'IGNORAR',
      );
      const seen = new Set<string>();
      const trace = rows
        .slice(0, 10)
        .map(
          (row: {
            row: number;
            key?: string;
            action: string;
            issues: { code: string }[];
          }) => {
            const result = {
              row: row.row,
              classificacaoArquivo: record.classificacaoArquivo,
              tipo: record.tipo,
              repeatedParent:
                label === 'baseline'
                  ? 'ABSENT_IN_EXECUTABLE'
                  : record.classificacaoArquivo === 'COMMERCIAL_TABLE' &&
                    tipo === 'PRODUTOS',
              key: row.key ?? null,
              seen: row.key ? seen.has(row.key) : false,
              decision: row.action,
              issues: row.issues.map((issue) => issue.code),
            };
            if (row.key) seen.add(row.key);
            return result;
          },
        );
      let executed;
      try {
        executed = await service.execute(actor, uploaded.id, {});
      } catch (error) {
        executed = {
          blocked: error instanceof Error ? error.message : String(error),
        };
      }
      const issues = await db.dataQualityIssue.groupBy({
        by: ['codigo', 'entidade'],
        where: { importacaoId: uploaded.id },
        _count: true,
      });
      const tables = await db.tabelaComercial.findMany({
        select: { id: true, produtoId: true },
      });
      const offers = await db.tabelaComercialItem.findMany({
        select: {
          codigoExterno: true,
          codigoPlano: true,
          prazoMeses: true,
          modalidade: true,
          creditoReferencia: true,
        },
      });
      const result = {
        schema,
        importacaoId: uploaded.id,
        tipo,
        previewRows: preview.quantidadeAproximada,
        validation,
        trace,
        executed,
        issues,
        products: await db.produto.count(),
        tables,
        offers,
      };
      await save(label, result);
      console.log(
        label,
        JSON.stringify({
          validation,
          issues,
          products: result.products,
          tables: tables.length,
          offers: offers.length,
        }),
      );
    } finally {
      await db.$disconnect();
      await pool.end();
    }
  }
}
