import { FileQuestion } from 'lucide-react';
import Link from 'next/link';

import { BrandMark } from '../components/brand-mark';

export default function NotFoundPage() {
  return (
    <main className="grid min-h-screen place-items-center px-6 py-16">
      <section className="w-full max-w-xl text-center">
        <div className="flex justify-center">
          <BrandMark />
        </div>
        <div className="mx-auto mt-12 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
          <FileQuestion aria-hidden="true" className="h-7 w-7" />
        </div>
        <p className="mt-6 text-xs font-bold tracking-[0.16em] text-[var(--color-primary)] uppercase">
          Erro 404
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Página não encontrada
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[var(--color-muted)]">
          O endereço não existe ou o módulo ainda não faz parte da plataforma.
        </p>
        <Link
          className="mt-8 inline-flex min-h-11 items-center rounded-[var(--radius-md)] bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
          href="/dashboard"
        >
          Voltar à visão geral
        </Link>
      </section>
    </main>
  );
}
