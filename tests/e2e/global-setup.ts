import { randomUUID } from 'node:crypto';

import { hash } from '@node-rs/argon2';
import { Client } from 'pg';

import { commercialE2e } from './commercial-fixture';

function testDatabaseUrl() {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error('TEST_DATABASE_URL is required for E2E');
  const target = new URL(testUrl);
  if (
    !['localhost', '127.0.0.1'].includes(target.hostname) ||
    target.pathname.slice(1) !== 'larcarvalho_test'
  )
    throw new Error('E2E must target the local larcarvalho_test database');
  return testUrl;
}

async function removePrevious(client: Client) {
  await client.query('DELETE FROM knowledge_chunks');
  await client.query('DELETE FROM knowledge_ingestions');
  await client.query('DELETE FROM knowledge_documents');
  await client.query('DELETE FROM commissions WHERE estorno_de_id IS NOT NULL');
  await client.query('DELETE FROM commissions');
  await client.query('DELETE FROM commission_rules');
  await client.query('DELETE FROM sale_documents');
  await client.query('DELETE FROM sale_contracts');
  await client.query('DELETE FROM sale_status_history');
  await client.query('DELETE FROM sales');
  await client.query('DELETE FROM proposal_status_history');
  await client.query('DELETE FROM proposal_items');
  await client.query('DELETE FROM proposals');
  await client.query('DELETE FROM simulation_favorites');
  await client.query('DELETE FROM simulation_results');
  await client.query('DELETE FROM simulation_calculation_snapshots');
  await client.query('DELETE FROM simulation_scenarios');
  await client.query('DELETE FROM simulations');
  await client.query('DELETE FROM product_commercial_rules');
  await client.query('DELETE FROM leads WHERE email_normalizado = $1', [
    commercialE2e.leadEmail,
  ]);
  const users = await client.query<{ id: string }>(
    'SELECT id FROM users WHERE email = $1',
    [commercialE2e.email],
  );
  for (const { id } of users.rows) {
    await client.query('DELETE FROM audit_logs WHERE actor_id = $1', [id]);
    await client.query(
      'DELETE FROM data_quality_issues WHERE importacao_id IN (SELECT id FROM importacoes WHERE criado_por_id = $1)',
      [id],
    );
    await client.query('DELETE FROM importacoes WHERE criado_por_id = $1', [
      id,
    ]);
    await client.query('DELETE FROM sessions WHERE user_id = $1', [id]);
    await client.query('DELETE FROM users WHERE id = $1', [id]);
  }
  const admins = await client.query<{ id: string }>(
    'SELECT id FROM administradoras WHERE cnpj = $1',
    [commercialE2e.adminCnpj],
  );
  for (const { id } of admins.rows) {
    await client.query(
      "DELETE FROM audit_logs WHERE (entity = 'TabelaComercial' AND entity_id IN (SELECT id::text FROM tabelas_comerciais WHERE administradora_id = $1)) OR (entity = 'TabelaComercialItem' AND entity_id IN (SELECT i.id::text FROM tabelas_comerciais_itens i JOIN tabelas_comerciais t ON t.id = i.tabela_comercial_id WHERE t.administradora_id = $1))",
      [id],
    );
    await client.query(
      'DELETE FROM tabelas_comerciais_itens WHERE tabela_comercial_id IN (SELECT id FROM tabelas_comerciais WHERE administradora_id = $1)',
      [id],
    );
    await client.query(
      'DELETE FROM tabelas_comerciais WHERE administradora_id = $1',
      [id],
    );
    await client.query(
      'DELETE FROM data_quality_issues WHERE grupo_id IN (SELECT id FROM grupos WHERE administradora_id = $1)',
      [id],
    );
    await client.query(
      'DELETE FROM contemplacoes WHERE assembleia_id IN (SELECT id FROM assembleias WHERE grupo_id IN (SELECT id FROM grupos WHERE administradora_id = $1))',
      [id],
    );
    await client.query(
      'DELETE FROM lances WHERE assembleia_id IN (SELECT id FROM assembleias WHERE grupo_id IN (SELECT id FROM grupos WHERE administradora_id = $1))',
      [id],
    );
    await client.query(
      'DELETE FROM assembleias WHERE grupo_id IN (SELECT id FROM grupos WHERE administradora_id = $1)',
      [id],
    );
    await client.query(
      'DELETE FROM cotas WHERE grupo_id IN (SELECT id FROM grupos WHERE administradora_id = $1)',
      [id],
    );
    await client.query(
      'DELETE FROM grupo_historicos WHERE grupo_id IN (SELECT id FROM grupos WHERE administradora_id = $1)',
      [id],
    );
    await client.query('DELETE FROM grupos WHERE administradora_id = $1', [id]);
    await client.query(
      "DELETE FROM produtos WHERE administradora_id = $1 AND nome = 'Imóvel E2E Compare'",
      [id],
    );
  }
}

export default async function globalSetup() {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    const database = await client.query<{ name: string }>(
      'SELECT current_database() AS name',
    );
    if (database.rows[0]?.name !== 'larcarvalho_test') {
      throw new Error('E2E cleanup requires the larcarvalho_test database');
    }
    console.log('E2E database verified: larcarvalho_test');
    await client.query('BEGIN');
    await removePrevious(client);
    const admin = await client.query<{ id: string }>(
      'INSERT INTO administradoras (id, nome, cnpj, ativa, updated_at) VALUES ($1, $2, $3, true, NOW()) ON CONFLICT (cnpj) DO UPDATE SET nome = EXCLUDED.nome, ativa = true, updated_at = NOW() RETURNING id',
      [randomUUID(), commercialE2e.adminName, commercialE2e.adminCnpj],
    );
    const adminId = admin.rows[0]?.id;
    const passwordHash = await hash(commercialE2e.password, {
      algorithm: 2,
      memoryCost: 19_456,
      outputLen: 32,
      parallelism: 1,
      timeCost: 2,
    });
    await client.query(
      "INSERT INTO users (id, nome, email, password_hash, role, ativo, updated_at) VALUES ($1, 'E2E Commercial Admin', $2, $3, 'SUPER_ADMIN', true, NOW())",
      [randomUUID(), commercialE2e.email, passwordHash],
    );
    const users = await client.query<{ id: string }>(
      'SELECT id FROM users WHERE email = $1',
      [commercialE2e.email],
    );
    await client.query(
      `INSERT INTO leads (id, nome, email_normalizado, origem, status, responsavel_id, updated_at)
       VALUES ($1, $2, $3, 'CADASTRO_MANUAL', 'QUALIFICADO', $4, NOW())`,
      [
        randomUUID(),
        commercialE2e.leadName,
        commercialE2e.leadEmail,
        users.rows[0]?.id,
      ],
    );
    if (admin.rowCount !== 1)
      throw new Error('Could not prepare E2E administradora');
    await client.query(
      `INSERT INTO commercial_configurations
        (id, organization_name, currency, rounding_mode, proposal_validity_days, rule_version_prefix, required_disclaimer, active, version, created_at, updated_at)
       VALUES ($1, 'Larcarvalho Consórcios', 'BRL', 'HALF_UP', 7, 'LC', $2, true, 1, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET active = true, updated_at = NOW()`,
      [
        '20000000-0000-4000-8000-000000000001',
        'Esta proposta usa regras configuradas e deve ser confirmada antes da contratação.',
      ],
    );
    if (adminId) {
      const product = await client.query<{ id: string }>(
        `INSERT INTO produtos (id, administradora_id, nome, categoria, ativo, updated_at)
         VALUES ($1, $2, 'Imóvel E2E Compare', 'IMOVEL', true, NOW())
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [randomUUID(), adminId],
      );
      const productId = product.rows[0]?.id ?? null;
      for (const index of [1, 2, 3, 4, 5]) {
        const group = await client.query<{ id: string }>(
          `INSERT INTO grupos
            (id, administradora_id, produto_id, codigo, status, prazo_meses, valor_credito_minimo, valor_credito_maximo, updated_at)
           VALUES ($1, $2, $3, $4, 'ATIVO', $5, $6, $7, NOW())
           ON CONFLICT (id) DO NOTHING RETURNING id`,
          [
            randomUUID(),
            adminId,
            productId,
            `E2E-CMP-${index}`,
            100 + index,
            `${100000 * index}`,
            `${100000 * (index + 1)}`,
          ],
        );
        const groupId = group.rows[0]?.id;
        if (groupId)
          await client.query(
            `INSERT INTO grupo_historicos
              (id, grupo_id, data_referencia, assembleias_realizadas, assembleias_com_dados_lance, assembleias_com_dados_contemplacao, lances_registrados, lances_contemplados, contemplacoes_registradas, contemplacoes_sorteio, contemplacoes_lance, contemplacoes_outras, percentual_lance_contemplado_minimo, percentual_lance_contemplado_mediano, percentual_lance_contemplado_medio, percentual_lance_contemplado_maximo, parcela_media, status)
             VALUES ($1, $2, '2026-09-01T00:00:00.000Z', 5, 5, 5, 50, 12, 12, 6, 6, 0, '10', '20', '21', '35', $3, 'ATIVO')`,
            [randomUUID(), groupId, `${1500 + index * 100}`],
          );
      }
      const table = await client.query<{ id: string }>(
        `INSERT INTO tabelas_comerciais
          (id, administradora_id, produto_id, nome, codigo, categoria, inicio_vigencia, status, updated_at)
         VALUES ($1, $2, $3, 'Tabela E2E Compare', 'E2E-CMP-PLAN', 'IMOVEL', '2026-01-01', 'ATIVA', NOW())
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [randomUUID(), adminId, productId],
      );
      const tableId = table.rows[0]?.id;
      if (tableId)
        await client.query(
          `INSERT INTO tabelas_comerciais_itens
            (id, tabela_comercial_id, credito_referencia, prazo_meses, modalidade, parcela_padrao, primeira_parcela, demais_parcelas, taxa_administracao_percentual, taxa_total_percentual, fundo_reserva_percentual, seguro_vida_percentual, participantes_grupo, codigo_plano, updated_at)
           VALUES ($1, $2, '250000', 120, 'NORMAL', '2500', '2800', '2500', '18', '20', '1.5', '0.5', 400, 'E2E-PLAN', NOW())
           ON CONFLICT (id) DO NOTHING`,
          [randomUUID(), tableId],
        );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}
