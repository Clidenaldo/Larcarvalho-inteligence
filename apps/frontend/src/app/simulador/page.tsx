import type { Metadata } from 'next';
import { BrandMark } from '../../components/brand-mark';
import { PublicThemeScope } from '../../components/public-theme';
import { getPublicTheme } from '../../services/api/public-theme';
import { SimuladorPublico } from '../../components/simulador-publico';
import { getFrontendConfig } from '../../config/env';
import type { SimuladorPublicoPerfil } from '@larcarvalho/shared';

export const metadata: Metadata = {
  title: 'Simulador de Consórcio | Larcarvalho Consórcios',
  description:
    'Compare opções de consórcio de acordo com crédito, parcela, prazo e perfil informado.',
};

const allowedCategories: SimuladorPublicoPerfil['categoria'][] = [
  'IMOVEL',
  'AUTOMOVEL',
  'MOTOCICLETA',
  'PESADOS',
  'SERVICOS',
  'OUTROS',
];

export default async function Page({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const config = getFrontendConfig();
  const params = await searchParams;
  const category =
    typeof params.categoria === 'string' &&
    allowedCategories.includes(
      params.categoria as SimuladorPublicoPerfil['categoria'],
    )
      ? (params.categoria as SimuladorPublicoPerfil['categoria'])
      : undefined;
  const credit =
    typeof params.credito === 'string'
      ? params.credito.slice(0, 18)
      : undefined;
  return (
    <PublicThemeScope theme={await getPublicTheme()}>
      <main className="simulation-surface min-h-screen">
        <header className="public-header public-simulator-header mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <BrandMark />
          <span className="rounded-full border border-indigo-900/10 bg-white/80 px-3 py-1 text-xs font-semibold text-[var(--color-primary)]">
            Simulação sem cadastro
          </span>
        </header>
        <section className="mx-auto max-w-4xl px-5 pb-16 pt-8 sm:px-8 sm:pt-14">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
              Larcarvalho Consórcios
            </p>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">
              Encontre opções de consórcio compatíveis com seus objetivos.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-[var(--color-text-soft)] sm:text-lg">
              Informe o que procura e compare grupos disponíveis com base em
              dados reais e históricos.
            </p>
          </div>
          <div className="mt-10">
            <SimuladorPublico
              apiBaseUrl={config.publicApiBaseUrl}
              initialCategory={category}
              initialCredit={credit}
              privacyPolicyUrl={config.privacyPolicyUrl}
              whatsappNumber={config.whatsappNumber}
            />
          </div>
        </section>
        <footer className="public-simulator-footer border-t border-[var(--color-border)] px-5 py-6 text-center text-xs">
          Simulação informativa. Dados de contato só são enviados com sua
          autorização.
        </footer>
      </main>
    </PublicThemeScope>
  );
}
