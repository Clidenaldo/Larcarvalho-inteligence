import { ShieldX } from 'lucide-react';
import Link from 'next/link';

import { Card } from '../../../components/ui/card';

export default function ForbiddenPage() {
  return (
    <Card className="mx-auto mt-10 max-w-xl px-6 py-12 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-red-50 text-[var(--color-danger)]">
        <ShieldX aria-hidden="true" className="h-7 w-7" />
      </div>
      <p className="mt-6 text-xs font-bold tracking-[0.14em] text-[var(--color-danger)] uppercase">
        Erro 403
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">
        Acesso não autorizado
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--color-muted)]">
        Sua conta não possui acesso a esta área. Se isso parecer incorreto, fale
        com um administrador.
      </p>
      <Link
        className="mt-7 inline-flex min-h-10 items-center rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
        href="/dashboard"
      >
        Voltar à visão geral
      </Link>
    </Card>
  );
}
