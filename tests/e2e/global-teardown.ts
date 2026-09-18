import { Client } from 'pg';

import { commercialE2e } from './commercial-fixture';

export default async function globalTeardown() {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) return;
  const target = new URL(testUrl);
  if (
    !['localhost', '127.0.0.1'].includes(target.hostname) ||
    target.pathname.slice(1) !== 'larcarvalho_test'
  )
    return;
  const client = new Client({ connectionString: testUrl });
  await client.connect();
  try {
    const database = await client.query<{ name: string }>(
      'SELECT current_database() AS name',
    );
    if (database.rows[0]?.name !== 'larcarvalho_test') {
      throw new Error('E2E cleanup requires the larcarvalho_test database');
    }
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM commissions WHERE estorno_de_id IS NOT NULL',
    );
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
      await client.query('DELETE FROM grupos WHERE administradora_id = $1', [
        id,
      ]);
      await client.query(
        "DELETE FROM produtos WHERE administradora_id = $1 AND nome = 'Imóvel E2E Compare'",
        [id],
      );
      await client.query('DELETE FROM administradoras WHERE id = $1', [id]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}
