import type { AdminTheme } from '@larcarvalho/shared';
import { AdminThemeScope } from './admin-theme';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/field';

export function AdminThemePreview({ theme }: { theme: AdminTheme }) {
  return (
    <div
      data-testid="admin-theme-preview"
      className="overflow-hidden rounded-xl border border-[var(--color-border)]"
    >
      <AdminThemeScope theme={theme}>
        <div className="grid min-h-80 grid-cols-[6.5rem_minmax(0,1fr)] text-xs">
          <aside className="app-navigation space-y-4 p-3">
            <strong>Painel</strong>
            <nav className="space-y-2">
              <span aria-current="page" className="block rounded-lg p-2">
                Dashboard
              </span>
              <span className="block p-2">CRM</span>
              <span className="block p-2">Tabelas</span>
            </nav>
          </aside>
          <div className="min-w-0">
            <header className="app-header p-3 font-semibold">
              Dashboard · Equipe
            </header>
            <div className="space-y-3 p-3">
              <Card className="p-3">
                <h4 className="font-semibold">Simulações</h4>
                <p className="text-xl font-bold">24</p>
                <p className="text-[var(--color-muted)]">Neste mês</p>
              </Card>
              <label className="block">
                Buscar
                <Input
                  aria-label="Buscar no preview administrativo"
                  placeholder="Nome do cliente"
                />
              </label>
              <Button>Nova simulação</Button>
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Exemplo</td>
                      <td>Ativo</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </AdminThemeScope>
    </div>
  );
}
