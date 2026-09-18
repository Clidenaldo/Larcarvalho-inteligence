import type { PublicTheme } from '@larcarvalho/shared';
import { PublicThemeScope } from './public-theme';
import { Button } from './ui/button';

export type PublicPreviewMode = 'Landing Page' | 'Simulador' | 'Resultado';
export function PublicThemePreview({
  theme,
  mode,
}: {
  theme: PublicTheme;
  mode: PublicPreviewMode;
}) {
  return (
    <div
      aria-label="Preview da área pública"
      className="overflow-hidden rounded-xl border border-[var(--color-border)]"
      data-testid="public-theme-preview"
    >
      <PublicThemeScope theme={theme}>
        <header className="public-header flex items-center justify-between gap-2 p-4 text-xs">
          <strong>LARCARVALHO</strong>
          <span>Consórcios · Entrar</span>
        </header>
        {mode === 'Landing Page' ? (
          <>
            <section className="public-hero p-5">
              <h3 className="public-hero-heading text-xl font-bold">
                Encontre o consórcio ideal para você
              </h3>
              <p className="my-3 text-sm">Compare opções com mais clareza.</p>
              <button
                className="public-button-secondary rounded-lg px-4 py-2 text-sm font-semibold"
                type="button"
              >
                Simule agora
              </button>
            </section>
            <section className="grid grid-cols-3 gap-2 bg-[var(--public-background-secondary)] p-4">
              {['Imóvel', 'Veículo', 'Pesados'].map((label) => (
                <article
                  className="rounded-lg border border-[var(--public-border)] bg-[var(--public-surface)] p-2 text-sm"
                  key={label}
                >
                  <h4 className="font-semibold">{label}</h4>
                  <p className="mt-2 text-xs text-[var(--public-text-muted)]">
                    Conheça as opções
                  </p>
                  <span className="mt-2 block text-xs font-semibold text-[var(--public-primary)]">Simular</span>
                </article>
              ))}
            </section>
          </>
        ) : (
          <section className="public-simulator p-4">
            <div className="rounded-xl border border-[var(--public-border)] bg-[var(--public-surface)] p-4">
              <h3 className="text-lg font-bold">
                {mode === 'Simulador'
                  ? 'Simule seu consórcio'
                  : 'Opções encontradas'}
              </h3>
              <p className="mt-2 text-xs text-[var(--public-text-muted)]">
                Exemplo visual; valores ilustrativos.
              </p>
              {mode === 'Simulador' ? (
                <div className="mt-4 space-y-3">
                  <p className="text-xs">Etapa 2 de 5</p>
                  <div className="h-2 rounded bg-[var(--public-surface-subtle)]">
                    <div className="h-2 w-2/5 rounded bg-[var(--public-simulator-accent)]" />
                  </div>
                  <label className="block text-sm">
                    Categoria
                    <select
                      aria-label="Categoria no preview"
                      className="mt-1 w-full rounded-lg border p-2"
                      defaultValue="Imóvel"
                    >
                      <option>Imóvel</option>
                      <option>Veículo</option>
                    </select>
                  </label>
                  <label className="block text-sm">
                    Crédito
                    <input
                      aria-label="Crédito no preview"
                      className="mt-1 w-full rounded-lg border p-2"
                      readOnly
                      value="R$ 200.000,00"
                    />
                  </label>
                  <Button>Continuar</Button>
                </div>
              ) : (
                <article className="public-result mt-4 rounded-lg border border-[var(--public-border)] p-3">
                  <h4 className="font-semibold">Plano ilustrativo</h4>
                  <p className="mt-2 text-xl font-bold text-[var(--public-simulator-accent)]">
                    R$ 2.480,00
                  </p>
                  <p className="text-xs text-[var(--public-text-muted)]">
                    Parcela · 120 meses
                  </p>
                  <span className="my-3 inline-block text-xs font-semibold text-[var(--public-accent)]">
                    Aderência 92/100
                  </span>
                  <Button className="w-full">
                    Quero falar com um especialista
                  </Button>
                </article>
              )}
            </div>
          </section>
        )}
        <footer className="public-footer p-4 text-xs">
          Larcarvalho Consórcios · Privacidade
        </footer>
      </PublicThemeScope>
    </div>
  );
}
