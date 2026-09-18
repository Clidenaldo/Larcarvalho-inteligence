import { expect, test } from '@playwright/test';
import { Client } from 'pg';
import { hash } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';

test('create seller with team, edit individual permissions, and enforce navigation and direct endpoint access', async ({ page, browser }) => {
  test.setTimeout(180000);
  const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  const id = randomUUID(); const email = `access-root-${id}@example.test`; const sellerEmail = `maria-${id}@example.test`; const password = `Access-${id}`;
  const createdIds = [id]; let teamId: string | undefined;
  await db.connect();
  try {
    await db.query('INSERT INTO users (id,nome,email,password_hash,role,ativo,updated_at) VALUES ($1,$2,$3,$4,$5,true,NOW())', [id, 'Access E2E Root', email, await hash(password), 'SUPER_ADMIN']);
    await page.goto('/login'); await page.locator('input[type=email]').fill(email); await page.locator('input[type=password]').fill(password); await page.getByRole('button', { name: /entrar/i }).click(); await expect(page).toHaveURL(/dashboard/, { timeout: 45000 });
    await page.goto('/dashboard/teams'); await page.getByLabel('Nome da equipe').fill(`Pesados ${id}`); await page.getByRole('button', { name: 'Salvar equipe' }).click(); await expect(page.getByText('Equipe salva.', { exact: true })).toBeVisible();
    const teams = await db.query<{ id: string }>('SELECT id FROM teams WHERE name=$1', [`Pesados ${id}`]); teamId = teams.rows[0]!.id;
    await page.goto('/dashboard/users'); await page.getByRole('button', { name: 'Novo usuário' }).click();
    const modal = page.getByRole('dialog'); await modal.getByRole('textbox', { name: 'Nome', exact: true }).fill('Maria E2E'); await modal.getByRole('textbox', { name: 'Email', exact: true }).fill(sellerEmail); await modal.getByLabel('Senha inicial').fill(password); await modal.getByRole('combobox', { name: 'Papel', exact: true }).selectOption('VENDEDOR'); await modal.getByRole('combobox', { name: 'Equipe', exact: true }).selectOption(teamId); await modal.getByRole('button', { name: 'Criar usuário' }).click();
    await expect(page.getByText('Usuário criado com sucesso.', { exact: true })).toBeVisible();
    const sellers = await db.query<{ id: string }>('SELECT id FROM users WHERE email=$1', [sellerEmail]); const sellerId = sellers.rows[0]!.id; createdIds.push(sellerId);
    await page.goto(`/dashboard/users/${sellerId}`); await page.getByLabel('Matrícula comercial').fill('MARIA-01'); await page.getByRole('button', { name: 'Salvar dados', exact: true }).click(); await expect(page.getByText('Alterações salvas.', { exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'comparador.read', exact: true }).selectOption('DENY'); await page.getByRole('button', { name: 'Salvar permissões', exact: true }).click(); await expect.poll(async () => (await db.query('SELECT effect FROM user_permission_overrides WHERE user_id=$1 AND permission=$2', [sellerId, 'comparador.read'])).rows[0]?.effect).toBe('DENY');
    const sellerContext = await browser.newContext(); const sellerPage = await sellerContext.newPage();
    try {
      await sellerPage.goto('http://localhost:3100/login'); await sellerPage.locator('input[type=email]').fill(sellerEmail); await sellerPage.locator('input[type=password]').fill(password); await sellerPage.getByRole('button', { name: /entrar/i }).click(); await expect(sellerPage).toHaveURL(/dashboard/, { timeout: 45000 });
      const nav = sellerPage.locator('aside');
      await expect(nav.getByRole('link', { name: 'CRM', exact: true })).toBeVisible(); await expect(nav.getByRole('link', { name: 'Nova simulação', exact: true })).toBeVisible(); await expect(nav.getByRole('link', { name: 'Propostas', exact: true })).toBeVisible();
      for (const name of ['Usuários', 'Aparencia', 'Auditoria', 'Comparador', 'Configuração comercial']) await expect(nav.getByRole('link', { name, exact: true })).toHaveCount(0);
      expect((await sellerContext.request.get('http://localhost:3100/api/users')).status()).toBe(403);
      expect((await sellerContext.request.put(`http://localhost:3100/api/users/${sellerId}/permissions`, { data: { overrides: [{ permission: 'users.read', effect: 'ALLOW' }] }, headers: { origin: 'http://localhost:3100' } })).status()).toBe(403);
      await sellerPage.goto('http://localhost:3100/dashboard/users'); await expect(sellerPage).toHaveURL(/forbidden/);
      await page.getByRole('combobox', { name: 'comparador.read', exact: true }).selectOption('INHERIT'); await page.getByRole('button', { name: 'Salvar permissões', exact: true }).click(); await expect.poll(async () => (await db.query('SELECT COUNT(*)::int AS count FROM user_permission_overrides WHERE user_id=$1', [sellerId])).rows[0]?.count).toBe(0);
      await sellerPage.goto('http://localhost:3100/dashboard'); await expect(sellerPage.locator('aside').getByRole('link', { name: 'Comparador', exact: true })).toBeVisible();
      await page.goto(`/dashboard/users?busca=${encodeURIComponent(sellerEmail)}`); await page.getByRole('button', { name: 'Desativar Maria E2E', exact: true }).click(); await page.getByRole('button', { name: 'Confirmar desativação' }).click(); await expect(page.getByText('Maria E2E foi desativado.', { exact: true })).toBeVisible();
      expect((await sellerContext.request.get('http://localhost:3100/api/users')).status()).toBe(401);
    } finally { await sellerContext.close(); }
    const actions = await db.query<{ action: string }>('SELECT action FROM audit_logs WHERE actor_id=$1', [id]); expect(actions.rows.map((row) => row.action)).toEqual(expect.arrayContaining(['TEAM_CREATED', 'USER_CREATED', 'USER_UPDATED', 'USER_PERMISSIONS_CHANGED', 'USER_DEACTIVATED']));
  } finally {
    // Delete only this test's fixtures, including a user created before an assertion failed.
    const extra = await db.query<{ id: string }>('SELECT id FROM users WHERE email=$1', [sellerEmail]); const ids = [...new Set([...createdIds, ...extra.rows.map((row) => row.id)])];
    await db.query('DELETE FROM audit_logs WHERE actor_id=ANY($1::text[]) OR entity_id=ANY($2::text[])', [ids, [...ids, ...(teamId ? [teamId] : [])]]);
    await db.query('DELETE FROM sessions WHERE user_id=ANY($1::uuid[])', [ids]);
    await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [ids]);
    await db.query('DELETE FROM teams WHERE name=$1', [`Pesados ${id}`]); await db.end();
  }
});
