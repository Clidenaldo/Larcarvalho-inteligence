import { expect, test } from '@playwright/test';
import { Client } from 'pg';
import { hash } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';

test('independent public/admin previews, persistence, resets, audit and mobile sidebar', async ({
  page,
  request,
}) => {
  const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  const userId = randomUUID(),
    appearanceId = randomUUID();
  const email = `independent-${userId}@example.test`,
    password = `Themes-${randomUUID()}`;
  await db.connect();
  try {
    await db.query(
      'INSERT INTO users (id,nome,email,password_hash,role,ativo,updated_at) VALUES ($1,$2,$3,$4,$5,true,NOW())',
      [
        userId,
        'Independent Themes E2E',
        email,
        await hash(password),
        'SUPER_ADMIN',
      ],
    );
    await db.query(
      'INSERT INTO appearance_configurations (id,version,updated_at) SELECT $1,COALESCE(MAX(version),0)+100,NOW() FROM appearance_configurations',
      [appearanceId],
    );
    await page.goto('/login');
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[type=password]').fill(password);
    await page.getByRole('button', { name: /entrar/i }).click();
    await expect(page).toHaveURL(/dashboard/, { timeout: 45000 });
    const shell = page.locator('.app-shell');
    await expect(shell).toHaveCSS('background-color', 'rgb(242, 242, 242)');
    // Compare default rendered colors against the previous shell's scoped palette.
    const defaultDifferences = await shell.evaluate((element) => {
      const originalStyle = element.getAttribute('style');
      const noTransitions = document.createElement('style');
      noTransitions.textContent = '* { transition: none !important; }';
      document.head.append(noTransitions);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d')!;
      const normalize = (color: string) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data].join(',');
      };
      const nodes = [element, ...element.querySelectorAll('*')];
      const colors = () =>
        nodes.map((node) => {
          const css = getComputedStyle(node);
          return [css.color, css.backgroundColor, css.borderTopColor]
            .map(normalize)
            .join('|');
        });
      const current = colors();
      element.classList.remove('admin-theme');
      element.setAttribute(
        'style',
        '--color-accent:#c05400;--color-background:#f2f2f2;--color-primary:#34806b;--color-primary-hover:color-mix(in srgb,#34806b 85%,black);--color-primary-soft:color-mix(in srgb,#34806b 10%,white);--color-focus:#34806b;--color-secondary:#000000;--color-warning:#9a5b08',
      );
      const previous = colors();
      element.classList.add('admin-theme');
      if (originalStyle) element.setAttribute('style', originalStyle);
      else element.removeAttribute('style');
      noTransitions.remove();
      return current.flatMap((value, index) =>
        value === previous[index]
          ? []
          : [
              {
                tag: nodes[index]?.tagName,
                className: nodes[index]?.getAttribute('class'),
                current: value,
                previous: previous[index],
              },
            ],
      );
    });
    expect(defaultDifferences).toEqual([]);
    const baseline = await shell.evaluate((element) => {
      const style = getComputedStyle(element);
      const sidebar = element.querySelector('.app-navigation')!;
      return {
        background: style.backgroundColor,
        color: style.color,
        sidebar: getComputedStyle(sidebar).backgroundColor,
      };
    });
    await page.goto('/configuracoes/aparencia');
    await page
      .getByLabel('Cor primária HEX público', { exact: true })
      .fill('#123456');
    await page
      .getByLabel('Botão primário HEX público', { exact: true })
      .fill('#654321');
    await expect(
      page.getByTestId('public-theme-preview').locator('.public-theme'),
    ).toHaveCSS('--public-primary', '#123456');
    expect(
      (
        await (
          await request.get('http://localhost:3101/api/v1/public/theme')
        ).json()
      ).primary,
    ).toBe('#34806b');
    await page
      .getByRole('button', { name: 'Salvar alterações', exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Tema público salvo' }),
    ).toBeVisible();
    await page.goto('/');
    await expect(page.locator('.public-theme')).toHaveCSS(
      '--public-primary',
      '#123456',
    );
    await expect(
      page.getByRole('button', { name: 'Continuar simulação' }),
    ).toHaveCSS('background-color', 'rgb(101, 67, 33)');
    await page.goto('/simulador');
    await expect(page.locator('.public-theme')).toHaveCSS(
      '--public-primary',
      '#123456',
    );
    await page.goto('/dashboard');
    await expect(shell).toHaveCSS('background-color', baseline.background);
    await expect(shell).toHaveCSS('color', baseline.color);
    await expect(page.locator('.app-navigation').first()).toHaveCSS(
      'background-color',
      baseline.sidebar,
    );
    await page.goto('/configuracoes/aparencia');
    await page
      .getByRole('button', { name: 'Painel administrativo', exact: true })
      .click();
    await expect(
      page.getByLabel('Cor primária HEX público', { exact: true }),
    ).toBeHidden();
    await page.locator('select:visible').selectOption('Escuro');
    const preview = page.getByTestId('admin-theme-preview');
    await expect(preview.locator('.app-navigation')).toHaveCSS(
      'background-color',
      'rgb(17, 24, 39)',
    );
    await expect(preview.locator('[data-ui=card]')).toHaveCSS(
      'background-color',
      'rgb(30, 41, 59)',
    );
    await expect(preview.locator('thead')).toHaveCSS(
      'background-color',
      'rgb(51, 65, 85)',
    );
    const unpublishedAdmin = await page.request.get(
      '/api/appearance/admin-theme',
    );
    expect((await unpublishedAdmin.json()).primary).toBe('#34806b');
    await expect(shell).toHaveCSS('background-color', baseline.background);
    await page
      .getByRole('button', {
        name: 'Salvar Painel Administrativo',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Tema administrativo salvo' }),
    ).toBeVisible();
    await page.reload();
    await expect(shell).toHaveCSS('background-color', 'rgb(15, 23, 42)');
    // Public preview is nested inside the dark administrative shell: CSS must stop at its boundary.
    const publicPreview = page.getByTestId('public-theme-preview');
    await page.getByRole('button', { name: 'Simulador', exact: true }).click();
    await expect(publicPreview.locator('.public-theme')).toHaveCSS(
      'color',
      'rgb(0, 0, 0)',
    );
    await expect(
      publicPreview.locator('[data-button-variant=primary]').first(),
    ).toHaveCSS('background-color', 'rgb(101, 67, 33)');
    await page.screenshot({
      path: 'test-results/public-theme/independent-previews.png',
      fullPage: true,
    });
    await page.goto('/dashboard');
    await expect(shell).toHaveCSS('--admin-primary', '#86efac');
    await expect(page.locator('.app-navigation').first()).toHaveCSS(
      'background-color',
      'rgb(17, 24, 39)',
    );
    await expect(
      page.locator('.app-navigation [aria-current=page]').first(),
    ).toHaveCSS('color', 'rgb(134, 239, 172)');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await expect(page.locator('dialog .app-navigation')).toHaveCSS(
      'background-color',
      'rgb(17, 24, 39)',
    );
    await page.screenshot({
      path: 'test-results/public-theme/admin-mobile.png',
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Fechar menu', exact: true })
      .last()
      .click();
    await page.goto('/');
    await expect(page.locator('.public-theme')).toHaveCSS(
      '--public-primary',
      '#123456',
    );
    await expect(
      page.getByRole('button', { name: 'Continuar simulação' }),
    ).toHaveCSS('background-color', 'rgb(101, 67, 33)');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/configuracoes/aparencia');
    await page
      .getByRole('button', { name: 'Restaurar cores padrão', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Restaurar padrão', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Salvar alterações', exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Tema público salvo' }),
    ).toBeVisible();
    await expect(shell).toHaveCSS('--admin-primary', '#86efac');
    await page
      .getByRole('button', { name: 'Painel administrativo', exact: true })
      .click();
    await page
      .getByRole('button', {
        name: 'Restaurar padrão do Painel Administrativo',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', { name: 'Restaurar padrão', exact: true })
      .click();
    await page
      .getByRole('button', {
        name: 'Salvar Painel Administrativo',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Tema administrativo salvo' }),
    ).toBeVisible();
    await page.goto('/dashboard');
    await expect(shell).toHaveCSS('background-color', baseline.background);
    expect(
      (
        await (
          await request.get('http://localhost:3101/api/v1/public/theme')
        ).json()
      ).primary,
    ).toBe('#34806b');
    const audit = await db.query(
      'SELECT action FROM audit_logs WHERE actor_id=$1 AND action LIKE $2 ORDER BY created_at',
      [userId, '%THEME%'],
    );
    expect(audit.rows.map((row: { action: string }) => row.action)).toEqual([
      'PUBLIC_THEME_UPDATED',
      'ADMIN_THEME_UPDATED',
      'PUBLIC_THEME_RESET',
      'ADMIN_THEME_RESET',
    ]);
  } finally {
    await db.query('DELETE FROM audit_logs WHERE actor_id=$1', [userId]);
    await db.query('DELETE FROM sessions WHERE user_id=$1', [userId]);
    await db.query('DELETE FROM users WHERE id=$1', [userId]);
    await db.query('DELETE FROM appearance_configurations WHERE id=$1', [
      appearanceId,
    ]);
    await db.end();
  }
});
