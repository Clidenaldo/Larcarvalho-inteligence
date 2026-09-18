import type { IndiceAderenciaResult } from '@larcarvalho/shared';
import { Badge } from './ui/badge';
import { Card } from './ui/card';

const labels = {
  CREDITO: 'Crédito',
  PARCELA: 'Parcela',
  PRAZO: 'Prazo',
  HISTORICO_LANCES: 'Histórico de lances',
  COBERTURA_HISTORICA: 'Cobertura histórica',
  CARACTERISTICAS_GRUPO: 'Características do grupo',
  QUALIDADE_DADOS: 'Qualidade dos dados',
} as const;

export function IndiceAderenciaPanel({
  codigo,
  result,
}: {
  codigo: string;
  result: IndiceAderenciaResult;
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-[var(--color-muted)]">Grupo {codigo}</p>
          <h2 className="text-lg font-semibold">Detalhe da aderência</h2>
        </div>
        {result.indice === null ? (
          <Badge tone="warning">Dados insuficientes</Badge>
        ) : (
          <div className="text-right">
            <strong className="text-2xl">{result.indice}/100</strong>
            <p className="text-xs text-[var(--color-muted)]">
              {result.classificacao?.replaceAll('_', ' ')}
            </p>
          </div>
        )}
      </div>
      <p className="mt-3 text-sm">
        Cobertura da avaliação: {result.coberturaAvaliacao}%
      </p>
      {result.indice === null ? (
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Dados insuficientes para calcular o Índice de Aderência. É necessário
          atingir 40% de peso avaliável.
        </p>
      ) : null}
      <div className="mt-5 space-y-4">
        {result.componentes.map((component) => (
          <section className="border-t pt-3" key={component.nome}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">{labels[component.nome]}</h3>
              <span className="text-sm">
                {component.pontuacaoPonderada === null
                  ? 'Indisponível'
                  : `${component.pontuacaoPonderada}/${component.pesoAvaliado}`}
              </span>
            </div>
            <p className="text-xs font-medium">{component.status}</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              {component.explicacao}
            </p>
          </section>
        ))}
      </div>
      <p className="mt-5 text-xs text-[var(--color-muted)]">
        {result.disclaimer}
      </p>
    </Card>
  );
}
