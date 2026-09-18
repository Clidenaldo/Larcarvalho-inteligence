// @vitest-environment jsdom
import type { AuthResponse } from '@larcarvalho/shared';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ImportacoesWizard } from '../src/components/importacoes-wizard';

vi.setConfig({ testTimeout: 20000 });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function identity(): AuthResponse {
  return {
    permissions: ['importacoes.create', 'importacoes.read'],
    user: {
      email: 'admin@larcarvalho.com.br',
      id: '11111111-1111-4111-8111-111111111111',
      nome: 'Admin',
      role: 'ADMIN',
    },
  };
}

describe('matriz de destino no wizard', () => {
  it('filtra destinos pela classificação e recalcula ao trocar', async () => {
    const user = userEvent.setup();
    render(<ImportacoesWizard identity={identity()} />);
    const classification = screen.getByRole('combobox', { name: /Que tipo de arquivo/ });
    const tipo = screen.getByRole('combobox', { name: /Tipo de dado/ });
    expect(within(tipo as HTMLElement).getByRole('option', { name: 'Grupos' })).toBeTruthy();

    await user.selectOptions(classification, 'COMMERCIAL_TABLE');
    expect(
      within(tipo as HTMLElement).queryByRole('option', { name: 'Grupos' }),
    ).toBeNull();
    expect(
      within(tipo as HTMLElement).getByRole('option', { name: 'Tabelas comerciais' }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Nunca cria grupos, cotas ou assembleias/),
    ).toBeTruthy();

    await user.selectOptions(classification, 'GROUP_PORTFOLIO');
    expect(
      within(tipo as HTMLElement).getByRole('option', { name: 'Grupos' }),
    ).toBeTruthy();
    expect(
      within(tipo as HTMLElement).queryByRole('option', { name: 'Tabelas comerciais' }),
    ).toBeNull();
  });

  it('sem classificação mantém todos os destinos (legado)', () => {
    render(<ImportacoesWizard identity={identity()} />);
    const tipo = screen.getByRole('combobox', { name: /Tipo de dado/ });
    for (const name of ['Administradoras', 'Grupos', 'Cotas', 'Tabelas comerciais']) {
      expect(within(tipo as HTMLElement).getByRole('option', { name })).toBeTruthy();
    }
  });
});
