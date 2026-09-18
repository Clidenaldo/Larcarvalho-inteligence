import {
  compararGruposRequestSchema,
  perfilAderenciaSchema,
} from '@larcarvalho/shared';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHeader } from '../../../../components/page-header';
import { Card } from '../../../../components/ui/card';
import { ComparadorSideBySide } from '../../../../components/comparador-side-by-side';
import { IndiceAderenciaPanel } from '../../../../components/indice-aderencia-panel';
import { getCurrentIdentity } from '../../../../services/api/auth';
import { compareGroups } from '../../../../services/api/comparador';
import { calculateAdherence } from '../../../../services/api/indice-aderencia';

export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  if (!identity.permissions.includes('comparador.read'))
    redirect('/dashboard/forbidden');
  const raw = await searchParams;
  const input = compararGruposRequestSchema.parse({
    grupoIds: raw.grupoIds?.split(',').filter(Boolean) ?? [],
    permitirCategoriasDiferentes: raw.permitirCategoriasDiferentes === 'true',
    valorCreditoDesejado: raw.valorCreditoDesejado,
    parcelaMaxima: raw.parcelaMaxima,
    prazoMinimo: raw.prazoMinimo,
    prazoMaximo: raw.prazoMaximo,
  });
  const result = await compareGroups(input);
  if (result === 'unauthorized') redirect('/login');
  if (result === 'forbidden') redirect('/dashboard/forbidden');
  if (typeof result === 'string')
    return (
      <Card className="p-6">
        <h2 className="font-semibold">Comparação não disponível</h2>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Verifique se os grupos ou planos existem e se suas categorias são
          compatíveis.
        </p>
        <Link
          className="mt-4 inline-block font-semibold text-[var(--color-primary)]"
          href="/dashboard/comparador"
        >
          Voltar ao comparador
        </Link>
      </Card>
    );
  const shouldCalculate = raw.calcularAderencia === 'true';
  const profile = shouldCalculate
    ? perfilAderenciaSchema.parse({
        categoria: raw.categoria,
        valorCreditoDesejado: raw.valorCreditoDesejado,
        parcelaMaxima: raw.parcelaMaxima,
        prazoMinimo: raw.prazoMinimo,
        prazoMaximo: raw.prazoMaximo,
        lanceDisponivelPercentual: raw.lanceDisponivelPercentual,
      })
    : null;
  const adherence = profile
    ? await calculateAdherence({
        perfil: profile,
        grupoIds: result.items
          .filter((item) => item.origem !== 'PLANO_COMERCIAL')
          .map((item) => item.grupo.id),
      })
    : null;
  if (adherence === 'unauthorized') redirect('/login');
  if (adherence === 'forbidden') redirect('/dashboard/forbidden');
  const adherenceItems =
    adherence && typeof adherence !== 'string' ? adherence.resultados : [];
  const adherenceMap = Object.fromEntries(
    adherenceItems.map((item) => [item.grupoId, item.indice]),
  );
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Diferenças factuais"
        title="Comparação lado a lado"
        description="Nenhuma opção é classificada como vencedora ou recomendada."
      />
      <Link
        className="font-semibold text-[var(--color-primary)]"
        href="/dashboard/comparador"
      >
        ← Voltar à busca
      </Link>
      <ComparadorSideBySide
        adherenceMap={adherenceMap}
        criterios={result.criterios}
        items={result.items}
        key={input.grupoIds.join(',')}
      />
      {profile ? (
        adherenceItems.length ? (
          <section aria-labelledby="adherence-title" className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold" id="adherence-title">
                Índice de Aderência
              </h2>
              <p className="text-sm text-[var(--color-muted)]">
                Componentes, pesos avaliados e dados indisponíveis de cada
                grupo avaliado.
              </p>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {adherenceItems.map((item) => (
                <IndiceAderenciaPanel
                  codigo={
                    result.items.find(
                      (group) => group.grupo.id === item.grupoId,
                    )?.grupo.codigo ?? item.grupoId
                  }
                  key={item.grupoId}
                  result={item}
                />
              ))}
            </div>
          </section>
        ) : (
          <Card className="p-5">
            <p className="font-semibold">Índice indisponível</p>
            <p className="text-sm text-[var(--color-muted)]">
              Não foi possível avaliar os grupos com o perfil informado.
            </p>
          </Card>
        )
      ) : null}
      <p className="text-xs text-[var(--color-muted)]">{result.disclaimer}</p>
    </div>
  );
}