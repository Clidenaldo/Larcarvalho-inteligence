'use client';

import { AlertTriangle } from 'lucide-react';

import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';

export default function DashboardError({
  retry,
}: {
  readonly error: Error & { digest?: string };
  readonly retry: () => void;
}) {
  return (
    <Card className="mx-auto mt-10 max-w-xl px-6 py-12 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-50 text-[var(--color-warning)]">
        <AlertTriangle aria-hidden="true" className="h-7 w-7" />
      </div>
      <h2 className="mt-6 text-2xl font-semibold">
        Não foi possível carregar esta área
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--color-muted)]">
        Ocorreu uma falha temporária. Tente carregar os dados novamente.
      </p>
      <Button className="mt-7" onClick={retry}>
        Tentar novamente
      </Button>
    </Card>
  );
}
