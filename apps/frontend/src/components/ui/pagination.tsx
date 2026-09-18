import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

export function Pagination({
  page,
  params = {},
  totalPages,
}: {
  readonly page: number;
  readonly params?: Readonly<Record<string, string | undefined>>;
  readonly totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const href = (target: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
    search.set('page', String(target));
    return `?${search.toString()}`;
  };
  return (
    <nav
      aria-label="Paginação"
      className="flex items-center justify-between gap-4 border-t border-[var(--color-border)] px-5 py-4"
    >
      <p className="text-sm text-[var(--color-muted)]">
        Página <strong className="text-[var(--color-text)]">{page}</strong> de{' '}
        {totalPages}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link
            aria-label="Página anterior"
            className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--color-border)] bg-white hover:bg-slate-50"
            href={href(page - 1)}
          >
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          </Link>
        ) : (
          <span
            aria-hidden="true"
            className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--color-border)] bg-slate-50 text-slate-300"
          >
            <ChevronLeft className="h-4 w-4" />
          </span>
        )}
        {page < totalPages ? (
          <Link
            aria-label="Próxima página"
            className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--color-border)] bg-white hover:bg-slate-50"
            href={href(page + 1)}
          >
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        ) : (
          <span
            aria-hidden="true"
            className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--color-border)] bg-slate-50 text-slate-300"
          >
            <ChevronRight className="h-4 w-4" />
          </span>
        )}
      </div>
    </nav>
  );
}
