import { BarChart3 } from 'lucide-react';

export function BrandMark({
  commercialName = 'Larcarvalho Consórcios',
  compact = false,
  logoUrl,
}: {
  readonly commercialName?: string | undefined;
  readonly compact?: boolean;
  readonly logoUrl?: string | null | undefined;
}) {
  const [brand, ...descriptorParts] = commercialName.split(/\s+/);
  const descriptor = descriptorParts.join(' ') || 'Intelligence';
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--color-primary)] text-white shadow-sm">
        {logoUrl ? (
          <img alt="" className="h-full w-full object-contain" src={logoUrl} />
        ) : (
          <BarChart3
            aria-hidden="true"
            className="h-5 w-5"
            strokeWidth={2.25}
          />
        )}
      </div>
      {!compact ? (
        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-tight text-[var(--color-text)]">
            {brand}
          </p>
          <p className="truncate text-xs font-medium tracking-wide text-[var(--color-muted)]">
            {descriptor.toUpperCase()}
          </p>
        </div>
      ) : null}
    </div>
  );
}
