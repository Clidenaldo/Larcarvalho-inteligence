import type { GrupoHistoricoSeries } from '@larcarvalho/shared';
import { formatBrl, formatDateTime } from '../lib/formatters';
import { Card } from './ui/card';
import { EmptyState } from './ui/empty-state';

type Point = GrupoHistoricoSeries['pontos'][number];
function SeriesChart({
  label,
  points,
  value,
}: {
  label: string;
  points: Point[];
  value: (point: Point) => number | null;
}) {
  const available = points
    .map((point, index) => ({ index, value: value(point) }))
    .filter((item): item is { index: number; value: number } =>
      Number.isFinite(item.value),
    );
  if (available.length < 2)
    return (
      <EmptyState
        title={`Sem série para ${label}`}
        description="São necessários ao menos dois snapshots com este dado."
      />
    );
  const values = available.map((item) => item.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = maximum - minimum || 1;
  const width = 600;
  const height = 180;
  const coordinates = available
    .map((item) => {
      const x = 20 + (item.index / Math.max(points.length - 1, 1)) * 560;
      const y = 160 - ((item.value - minimum) / span) * 140;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <figure className="p-5">
      <figcaption className="mb-3 font-semibold">{label}</figcaption>
      <svg
        aria-label={`${label}: dados históricos observados`}
        className="h-44 w-full"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <line stroke="#cbd5e1" x1="20" x2="580" y1="160" y2="160" />
        <polyline
          fill="none"
          points={coordinates}
          stroke="var(--color-primary)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
        />
      </svg>
      <p className="text-xs text-[var(--color-muted)]">
        Dados históricos observados; mínimo {minimum.toLocaleString('pt-BR')} e
        máximo {maximum.toLocaleString('pt-BR')}.
      </p>
    </figure>
  );
}
export function HistoricoSeries({ series }: { series: GrupoHistoricoSeries }) {
  if (series.pontos.length === 0)
    return (
      <Card>
        <EmptyState
          title="Nenhuma série temporal disponível"
          description="Registre snapshots para iniciar o histórico observado."
        />
      </Card>
    );
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Séries temporais observadas</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <SeriesChart
            label="Evolução do crédito máximo"
            points={series.pontos}
            value={(point) =>
              point.valorCreditoMaximo === null
                ? null
                : Number(point.valorCreditoMaximo)
            }
          />
        </Card>
        <Card>
          <SeriesChart
            label="Lance contemplado mediano (%)"
            points={series.pontos}
            value={(point) =>
              point.percentualLanceContempladoMediano === null
                ? null
                : Number(point.percentualLanceContempladoMediano)
            }
          />
        </Card>
        <Card>
          <SeriesChart
            label="Contemplações registradas"
            points={series.pontos}
            value={(point) => point.contemplacoesRegistradas}
          />
        </Card>
      </div>
      <Card className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <caption className="p-4 text-left font-semibold">
            Tabela acessível das séries observadas
          </caption>
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3">Capturado em</th>
              <th className="px-4 py-3">Crédito máximo</th>
              <th className="px-4 py-3">Lance mediano</th>
              <th className="px-4 py-3">Contemplações</th>
            </tr>
          </thead>
          <tbody>
            {series.pontos.map((point) => (
              <tr className="border-t" key={point.snapshotId}>
                <td className="px-4 py-3">
                  {formatDateTime(point.capturadoEm)}
                </td>
                <td className="px-4 py-3">
                  {point.valorCreditoMaximo === null
                    ? 'Indisponível'
                    : formatBrl(Number(point.valorCreditoMaximo))}
                </td>
                <td className="px-4 py-3">
                  {point.percentualLanceContempladoMediano === null
                    ? 'Indisponível'
                    : `${Number(point.percentualLanceContempladoMediano).toLocaleString('pt-BR')}%`}
                </td>
                <td className="px-4 py-3">
                  {point.contemplacoesRegistradas ?? 'Indisponível'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
