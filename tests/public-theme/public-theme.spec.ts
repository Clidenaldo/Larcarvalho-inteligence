import { expect, test } from '@playwright/test';
import { Client } from 'pg';
import { hash } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';

test('admin previews, saves, reloads public pages and restores the public theme', async ({
  page,
  request,
}) => {
  const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  const userId = randomUUID(),
    appearanceId = randomUUID();
  const administratorId = randomUUID(), tableId = randomUUID(), itemId = randomUUID();
  const email = `public-theme-${userId}@example.test`,
    password = `PublicTheme-${randomUUID()}`;
  await db.connect();
  try {
    await db.query(
      'INSERT INTO users (id,nome,email,password_hash,role,ativo,updated_at) VALUES ($1,$2,$3,$4,$5,true,NOW())',
      [userId, 'Public Theme E2E', email, await hash(password), 'SUPER_ADMIN'],
    );
    await db.query(
      'INSERT INTO appearance_configurations (id,version,updated_at) SELECT $1,COALESCE(MAX(version),0)+100,NOW() FROM appearance_configurations',
      [appearanceId],
    );
    await db.query('INSERT INTO administradoras (id,nome,ativa,updated_at) VALUES ($1,$2,true,NOW())', [administratorId, `Theme E2E ${administratorId}`]);
    await db.query("INSERT INTO tabelas_comerciais (id,administradora_id,nome,codigo,categoria,inicio_vigencia,status,updated_at) VALUES ($1,$2,'Theme E2E','THEME-E2E','IMOVEL','2020-01-01','ATIVA',NOW())", [tableId, administratorId]);
    await db.query("INSERT INTO tabelas_comerciais_itens (id,tabela_comercial_id,credito_referencia,prazo_meses,modalidade,parcela_padrao,updated_at) VALUES ($1,$2,'219876',120,'NORMAL','2500',NOW())", [itemId, tableId]);
    await page.goto('/login');
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[type=password]').fill(password);
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page).toHaveURL(/dashboard/);
    await page.goto('/configuracoes/aparencia');
    await page
      .getByRole('button', { name: 'Área pública', exact: true })
      .click();
    await page
      .getByLabel('Cor primária HEX público', { exact: true })
      .fill('#123456');
    await page
      .getByLabel('Fundo principal HEX público', { exact: true })
      .fill('#eef1f5');
    await page
      .getByLabel('Botão primário HEX público', { exact: true })
      .fill('#654321');
    const preview = page
      .getByTestId('public-theme-preview')
      .locator('.public-theme');
    await expect(preview).toHaveCSS('--public-primary', '#123456');
    const unpublished = await request.get(
      'http://localhost:3101/api/v1/public/theme',
    );
    expect((await unpublished.json()).primary).toBe('#34806b');
    await page.screenshot({ path: 'test-results/public-theme/preview-desktop.png', fullPage: true });
    await page
      .getByRole('button', { name: 'Salvar alterações', exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Tema público salvo' }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByLabel('Cor primária HEX público', { exact: true }),
    ).toHaveValue('#123456');
    await page.goto('/');
    await expect(page.locator('.public-theme')).toHaveCSS(
      '--public-primary',
      '#123456',
    );
    await expect(
      page.getByRole('button', { name: 'Continuar simulação' }),
    ).toHaveCSS('background-color', 'rgb(101, 67, 33)');
    await page.screenshot({ path: 'test-results/public-theme/landing-desktop.png', fullPage: true });
    await page.goto('/simulador');
    await expect(page.locator('.public-theme')).toHaveCSS(
      '--public-primary',
      '#123456',
    );
    await expect(
      page.getByRole('button', { name: 'Continuar', exact: true }),
    ).toHaveCSS('background-color', 'rgb(101, 67, 33)');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole('radio', { name: 'Imóvel', exact: true }).check();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByLabel('Valor do crédito').fill('219876');
    for (let step = 0; step < 3; step++) await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByRole('button', { name: 'Simular opções', exact: true }).click();
    const result = page.locator('.public-result').filter({ hasText: `Theme E2E ${administratorId}` });
    await expect(result).toBeVisible();
    await expect(result).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await result.getByRole('button', { name: 'Quero falar com um especialista' }).click();
    await expect(result.getByRole('textbox', { name: 'Nome', exact: true })).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(result.getByRole('button', { name: 'Enviar solicitação' })).toHaveCSS('background-color', 'rgb(101, 67, 33)');
    await page.screenshot({ path: 'test-results/public-theme/result-mobile.png', fullPage: true });
    await page.goto('/configuracoes/aparencia');
    await page
      .getByRole('button', { name: 'Restaurar cores padrão', exact: true })
      .click();
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(
      page.getByLabel('Cor primária HEX público', { exact: true }),
    ).toHaveValue('#123456');
    await page
      .getByRole('button', { name: 'Restaurar cores padrão', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Restaurar padrão', exact: true })
      .click();
    await expect(
      page.getByLabel('Cor primária HEX público', { exact: true }),
    ).toHaveValue('#34806b');
    await page
      .getByRole('button', { name: 'Salvar alterações', exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Tema público salvo' }),
    ).toBeVisible();
    expect(
      (
        await (
          await request.get('http://localhost:3101/api/v1/public/theme')
        ).json()
      ).primary,
    ).toBe('#34806b');
  } finally {
    // Remove only fixtures created by this test, never existing configurations or business data.
    await db.query('DELETE FROM audit_logs WHERE actor_id=$1', [userId]);
    await db.query('DELETE FROM sessions WHERE user_id=$1', [userId]);
    await db.query('DELETE FROM users WHERE id=$1', [userId]);
    await db.query('DELETE FROM appearance_configurations WHERE id=$1', [
      appearanceId,
    ]);
    await db.query('DELETE FROM tabelas_comerciais_itens WHERE id=$1', [itemId]);
    await db.query('DELETE FROM tabelas_comerciais WHERE id=$1', [tableId]);
    await db.query('DELETE FROM administradoras WHERE id=$1', [administratorId]);
    await db.end();
  }
});
