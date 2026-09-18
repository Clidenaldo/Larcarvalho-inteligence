import { CheckCircle2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { redirect } from 'next/navigation';

import { BrandMark } from '../../components/brand-mark';
import { LoginForm } from '../../components/login-form';
import { getCurrentUser } from '../../services/api/auth';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/dashboard');

  return (
    <main className="grid min-h-screen bg-[var(--color-surface)] lg:grid-cols-[1.05fr_0.95fr]">
      <section className="brand-splash relative hidden overflow-hidden px-12 py-14 lg:flex lg:flex-col lg:justify-between xl:px-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,var(--color-primary-soft),transparent_65%)]" />
        <div className="relative inline-flex w-fit rounded-2xl bg-white p-3">
          <BrandMark />
        </div>
        <div className="relative max-w-xl">
          <p className="text-sm font-semibold tracking-[0.16em] text-[var(--color-on-dark)] uppercase">
            Plataforma de gestão e análise
          </p>
          <h1 className="mt-5 text-5xl leading-[1.08] font-semibold tracking-[-0.045em]">
            Inteligência para decisões melhores em consórcios.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-[var(--color-on-dark)]">
            Uma experiência administrativa clara, segura e preparada para
            acompanhar a evolução da operação.
          </p>
        </div>
        <div className="relative flex flex-wrap gap-x-6 gap-y-3 text-sm text-[var(--color-on-dark)]">
          {['Sessão protegida', 'Acesso por permissões', 'Auditoria ativa'].map(
            (item) => (
              <span className="flex items-center gap-2" key={item}>
                <CheckCircle2
                  aria-hidden="true"
                  className="h-4 w-4 text-[var(--color-brand)]"
                />
                {item}
              </span>
            ),
          )}
        </div>
      </section>
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden">
            <BrandMark />
          </div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-primary)]">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            Acesso interno
          </div>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            Entre na plataforma
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">
            Use as credenciais fornecidas pela administração. Não existe
            cadastro público.
          </p>
          <LoginForm />
          <div className="mt-8 flex items-center gap-2 border-t border-[var(--color-border)] pt-5 text-xs text-[var(--color-muted)]">
            <LockKeyhole aria-hidden="true" className="h-4 w-4" />
            Sua sessão é protegida por cookie seguro e HttpOnly.
          </div>
        </div>
      </section>
    </main>
  );
}
