'use client';

import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  Menu,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { trackPublicEvent } from '../lib/analytics';

const categories = [
  {
    value: 'IMOVEL',
    title: 'Imóveis',
    description: 'Planeje sua casa, terreno ou investimento com mais clareza.',
    icon: '⌂',
  },
  {
    value: 'AUTOMOVEL',
    title: 'Automóveis',
    description: 'Compare alternativas para seu próximo carro.',
    icon: '↗',
  },
  {
    value: 'MOTOCICLETA',
    title: 'Motocicletas',
    description: 'Encontre caminhos para mobilidade no seu ritmo.',
    icon: '◒',
  },
  {
    value: 'PESADOS',
    title: 'Caminhões e pesados',
    description: 'Avalie opções para trabalho, transporte e operação.',
    icon: '▣',
  },
  {
    value: 'SERVICOS',
    title: 'Serviços',
    description: 'Organize planos para projetos e serviços importantes.',
    icon: '✦',
  },
] as const;
type LandingCategory = (typeof categories)[number]['value'];

const faqs = [
  [
    'O que é consórcio?',
    'É uma forma de planejamento coletivo para aquisição de bens ou serviços, conforme as regras do grupo e da administradora.',
  ],
  [
    'O que é o Índice de Aderência?',
    'É uma medida de compatibilidade entre os critérios informados por você e os dados disponíveis de cada grupo. Ele não representa probabilidade, promessa ou garantia de contemplação.',
  ],
  [
    'Preciso informar meus dados para simular?',
    'Não. Você pode realizar a simulação primeiro. O contato só é solicitado depois, se quiser conversar com um especialista.',
  ],
  [
    'A simulação é gratuita?',
    'Sim. A simulação é informativa e não cria compromisso de contratação.',
  ],
] as const;

export function PublicLanding() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [category, setCategory] = useState<LandingCategory | ''>('');
  const [credit, setCredit] = useState('');
  useEffect(() => {
    trackPublicEvent('LANDING_VIEWED', { path: window.location.pathname });
  }, []);

  function startSimulation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    trackPublicEvent('LANDING_CTA_CLICKED', {
      path: window.location.pathname,
      category: category || null,
    });
    const params = new URLSearchParams();
    if (category) params.set('categoria', category);
    if (credit.trim()) params.set('credito', credit.trim());
    const query = params.toString();
    window.location.href = query ? `/simulador?${query}` : '/simulador';
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <main className="overflow-hidden">
      <header className="public-header sticky top-0 z-40 border-b border-white/10 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Link
            aria-label="Larcarvalho Consórcios - início"
            className="flex items-center gap-3"
            href="/"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15">
              <BarChart3 aria-hidden="true" className="h-5 w-5" />
            </span>
            <span>
              <strong className="block text-sm tracking-tight">
                LARCARVALHO
              </strong>
              <span className="block text-[10px] font-semibold tracking-[0.22em] text-[var(--color-on-dark)]">
                CONSÓRCIOS
              </span>
            </span>
          </Link>
          <nav
            aria-label="Navegação principal"
            className="hidden items-center gap-6 text-sm lg:flex"
          >
            <a className="hover:text-[var(--color-on-dark)]" href="#inicio">
              Início
            </a>
            <a
              className="hover:text-[var(--color-on-dark)]"
              href="#como-funciona"
            >
              Como funciona
            </a>
            <a className="hover:text-[var(--color-on-dark)]" href="#consorcios">
              Tipos de consórcio
            </a>
            <a
              className="hover:text-[var(--color-on-dark)]"
              href="#diferenciais"
            >
              Por que a Larcarvalho
            </a>
            <a className="hover:text-[var(--color-on-dark)]" href="#duvidas">
              Dúvidas
            </a>
          </nav>
          <div className="hidden items-center gap-3 sm:flex">
            <Link
              className="rounded-lg px-3 py-2 text-sm font-semibold text-[var(--color-on-dark)] hover:bg-white/10"
              href="/login"
            >
              Área administrativa
            </Link>
            <Link
              className="rounded-lg public-button-secondary px-4 py-2.5 text-sm font-bold text-[var(--color-primary)] shadow-sm hover:bg-[var(--color-primary-soft)]"
              href="/simulador"
            >
              Simular agora
            </Link>
          </div>
          <button
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            className="rounded-lg p-2 hover:bg-white/10 sm:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            type="button"
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
        {menuOpen ? (
          <nav
            aria-label="Menu mobile"
            className="border-t border-white/10 px-5 pb-5 pt-3 sm:hidden"
          >
            <div className="grid gap-1">
              {[
                ['Início', '#inicio'],
                ['Como funciona', '#como-funciona'],
                ['Tipos de consórcio', '#consorcios'],
                ['Por que a Larcarvalho', '#diferenciais'],
                ['Dúvidas', '#duvidas'],
              ].map(([label, href]) => (
                <a
                  className="rounded-lg px-3 py-3 text-sm hover:bg-white/10"
                  href={href}
                  key={href}
                  onClick={closeMenu}
                >
                  {label}
                </a>
              ))}
              <Link
                className="mt-2 rounded-lg public-button-secondary px-3 py-3 text-center text-sm font-bold text-[var(--color-primary)]"
                href="/simulador"
                onClick={closeMenu}
              >
                Simular agora
              </Link>
              <Link
                className="rounded-lg px-3 py-3 text-center text-sm font-semibold text-[var(--color-on-dark)]"
                href="/login"
                onClick={closeMenu}
              >
                Área administrativa
              </Link>
            </div>
          </nav>
        ) : null}
      </header>

      <section className="public-hero relative" id="inicio">
        <div className="absolute inset-0 bg-[image:var(--gradient-brand-hero)]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-16 sm:px-8 sm:pb-28 sm:pt-24 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-on-dark)]">
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
              Decisão com mais clareza
            </p>
            <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
              Seu próximo grande plano começa com uma escolha inteligente.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--color-on-dark)]">
              Compare opções de consórcio e descubra grupos mais aderentes ao
              seu perfil usando dados reais e critérios objetivos.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex items-center justify-center gap-2 rounded-xl public-button-secondary px-5 py-3.5 text-sm font-bold text-[var(--color-primary)] shadow-lg hover:bg-[var(--color-primary-soft)]"
                href="/simulador"
              >
                Simular meu consórcio{' '}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
              <a
                className="inline-flex items-center justify-center rounded-xl border border-white/25 px-5 py-3.5 text-sm font-bold text-[var(--public-hero-text)] hover:bg-white/10"
                href="#como-funciona"
              >
                Entender como funciona
              </a>
            </div>
            <p className="mt-5 text-xs text-[var(--color-on-dark)]">
              Simulação informativa, sem cadastro obrigatório e sem promessa de
              contemplação.
            </p>
          </div>
          <div className="rounded-3xl border border-white/20 bg-[var(--public-surface)] p-5 text-[var(--color-text)] shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-primary)]">
                  Comece por aqui
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight">
                  O que você quer conquistar?
                </h2>
              </div>
              <div className="rounded-2xl bg-[var(--color-primary-soft)] p-3 text-[var(--color-primary)]">
                <BarChart3 aria-hidden="true" />
              </div>
            </div>
            <form className="mt-6 space-y-4" onSubmit={startSimulation}>
              <label className="block text-sm font-semibold">
                Tipo de consórcio
                <select
                  className="mt-2 min-h-12 w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--public-input-background)] px-3 text-sm font-normal focus:border-[var(--color-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--color-primary-soft)]"
                  onChange={(event) =>
                    setCategory(event.target.value as LandingCategory | '')
                  }
                  value={category}
                >
                  <option value="">Escolha uma categoria</option>
                  {categories.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Valor de crédito desejado
                <input
                  className="mt-2 min-h-12 w-full rounded-xl border border-[var(--color-border-strong)] px-3 text-sm font-normal placeholder:text-slate-400 focus:border-[var(--color-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--color-primary-soft)]"
                  inputMode="decimal"
                  onChange={(event) => setCredit(event.target.value)}
                  placeholder="Ex.: 250000"
                  value={credit}
                />
              </label>
              <button
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl public-button-primary px-4 text-sm font-bold"
                type="submit"
              >
                Continuar simulação{' '}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </button>
              <p className="text-center text-xs text-[var(--color-muted)]">
                Você verá as opções antes de decidir se quer falar com a equipe.
              </p>
            </form>
          </div>
        </div>
      </section>

      <section
        className="bg-[var(--public-background-secondary)] px-5 py-16 sm:px-8 sm:py-24"
        id="como-funciona"
      >
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
              Como funciona
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Informação organizada para uma decisão mais tranquila.
            </h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-4">
            {[
              [
                '01',
                'Conte o que você procura.',
                'Informe categoria, crédito e preferências da sua busca.',
              ],
              [
                '02',
                'Analisamos opções compatíveis.',
                'O sistema aplica os critérios informados aos dados disponíveis.',
              ],
              [
                '03',
                'Compare os dados.',
                'Veja crédito, parcela, prazo, histórico e cobertura da avaliação.',
              ],
              [
                '04',
                'Fale com um especialista.',
                'Se quiser ajuda, envie seus dados com seu consentimento.',
              ],
            ].map(([number, title, description]) => (
              <article
                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-5"
                key={number}
              >
                <span className="text-sm font-black text-[var(--color-primary)]">
                  {number}
                </span>
                <h3 className="mt-8 text-lg font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--color-text-soft)]">
                  {description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        className="bg-[var(--color-background)] px-5 py-16 sm:px-8 sm:py-24"
        id="consorcios"
      >
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div className="max-w-2xl">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
                Tipos de consórcio
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Planos diferentes. O mesmo cuidado na análise.
              </h2>
            </div>
            <Link
              className="inline-flex items-center gap-2 text-sm font-bold text-[var(--color-primary)]"
              href="/simulador"
            >
              Ver todas as opções <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {categories.map((item) => (
              <article
                className="group flex min-h-64 flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--public-surface)] p-5 shadow-[var(--shadow-sm)] transition hover:-translate-y-1 hover:shadow-[var(--shadow-md)]"
                key={item.value}
              >
                <span
                  aria-hidden="true"
                  className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--color-primary-soft)] text-2xl font-bold text-[var(--color-primary)]"
                >
                  {item.icon}
                </span>
                <h3 className="mt-8 text-lg font-bold">{item.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-6 text-[var(--color-text-soft)]">
                  {item.description}
                </p>
                <Link
                  className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[var(--color-primary)]"
                  href={`/simulador?categoria=${item.value}`}
                >
                  Simular{' '}
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        className="bg-[var(--public-background-secondary)] px-5 py-16 sm:px-8 sm:py-24"
        id="diferenciais"
      >
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.85fr_1.15fr] lg:items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
              Por que a Larcarvalho
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Consórcio com mais informação para você decidir.
            </h2>
            <p className="mt-5 text-base leading-7 text-[var(--color-text-soft)]">
              A plataforma reúne os dados disponíveis dos grupos e transforma
              sua busca em uma comparação objetiva, sem atalhos e sem promessas.
            </p>
            <ul className="mt-7 grid gap-4">
              {[
                'Dados de grupos organizados',
                'Histórico disponível para consulta',
                'Critérios informados por você',
                'Atendimento humano quando precisar',
              ].map((item) => (
                <li
                  className="flex items-center gap-3 text-sm font-semibold"
                  key={item}
                >
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                    <Check aria-hidden="true" className="h-4 w-4" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="public-secondary-panel rounded-3xl bg-[var(--color-secondary)] p-6 text-white shadow-[var(--shadow-md)] sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-100">
                  Exemplo de visualização
                </p>
                <h3 className="mt-2 text-2xl font-bold">Índice de Aderência</h3>
              </div>
              <Sparkles
                aria-hidden="true"
                className="h-7 w-7 text-[var(--color-brand)]"
              />
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {[
                'Compatibilidade do perfil',
                'Cobertura dos dados',
                'Crédito',
                'Parcela',
                'Prazo',
                'Histórico',
              ].map((item) => (
                <div
                  className="rounded-xl border border-white/15 bg-white/10 p-4"
                  key={item}
                >
                  <p className="text-xs text-blue-100">{item}</p>
                  <div className="mt-3 h-2 rounded-full bg-white/15">
                    <div className="h-2 w-2/3 rounded-full bg-[var(--color-brand)]" />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-6 text-sm leading-6 text-blue-50">
              O Índice de Aderência mede compatibilidade entre seu perfil e os
              dados disponíveis do grupo. Ele não representa probabilidade ou
              garantia de contemplação.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-[var(--color-background)] px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-3">
          {[
            [
              'Escolha com contexto',
              'Compare diferentes opções e consulte as informações históricas disponíveis.',
            ],
            [
              'Simule gratuitamente',
              'Entenda o que combina com seus planos antes de tomar qualquer decisão.',
            ],
            [
              'Seus dados com responsabilidade',
              'O contato só acontece com sua autorização e dentro do fluxo do CRM.',
            ],
          ].map(([title, description]) => (
            <article
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--public-surface)] p-6"
              key={title}
            >
              <ShieldCheck className="h-6 w-6 text-[var(--color-primary)]" />
              <h3 className="mt-5 text-lg font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--color-text-soft)]">
                {description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="public-hero px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-7 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--color-on-dark)]">
              Pronto para começar?
            </p>
            <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
              Descubra opções mais compatíveis com seus planos.
            </h2>
          </div>
          <Link
            className="inline-flex shrink-0 items-center gap-2 rounded-xl public-button-secondary px-5 py-3.5 text-sm font-bold text-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
            href="/simulador"
          >
            Fazer minha simulação <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section
        className="bg-[var(--public-background-secondary)] px-5 py-16 sm:px-8 sm:py-24"
        id="duvidas"
      >
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">
            Dúvidas
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Informação clara para você seguir seguro.
          </h2>
          <div className="mt-8 divide-y divide-[var(--color-border)] rounded-2xl border border-[var(--color-border)] px-5">
            {faqs.map(([question, answer]) => (
              <details className="group py-5" key={question}>
                <summary className="flex list-none items-center justify-between gap-4 font-bold">
                  <span>{question}</span>
                  <ChevronDown
                    aria-hidden="true"
                    className="h-5 w-5 shrink-0 text-[var(--color-primary)] transition group-open:rotate-180"
                  />
                </summary>
                <p className="max-w-2xl pt-3 text-sm leading-6 text-[var(--color-text-soft)]">
                  {answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[var(--color-surface-subtle)] px-5 py-10 sm:px-8">
        <div className="mx-auto max-w-5xl rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
          <strong>Informação importante:</strong> as informações apresentadas
          possuem caráter informativo e podem variar conforme administradora,
          grupo, regulamento e condições contratuais. O Índice de Aderência mede
          compatibilidade com critérios informados e dados disponíveis e não
          representa probabilidade, promessa ou garantia de contemplação.
        </div>
      </section>

      <footer className="public-footer px-5 py-12 sm:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--color-primary)]">
                <BarChart3 className="h-5 w-5" />
              </span>
              <strong>LARCARVALHO CONSÓRCIOS</strong>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-6">
              Informação organizada para ajudar você a comparar opções e
              planejar os próximos passos.
            </p>
          </div>
          <div>
            <h2 className="text-sm font-bold">Navegue</h2>
            <div className="mt-4 grid gap-3 text-sm">
              <a href="#como-funciona">Como funciona</a>
              <a href="#consorcios">Consórcios</a>
              <a href="#duvidas">Dúvidas</a>
              <Link href="/simulador">Simulador</Link>
            </div>
          </div>
          <div>
            <h2 className="text-sm font-bold">Privacidade</h2>
            <div className="mt-4 grid gap-3 text-sm">
              <Link href="/privacidade">Política de Privacidade</Link>
              <Link href="/login">Área administrativa</Link>
              <Link href="/simulador">Começar simulação</Link>
            </div>
          </div>
        </div>
        <div className="mx-auto mt-10 max-w-7xl border-t border-white/10 pt-5 text-xs">
          © {new Date().getFullYear()} Larcarvalho Consórcios. Simulação
          informativa.
        </div>
      </footer>
    </main>
  );
}
