'use client';

import type {
  AppearanceConfiguration,
  AuthResponse,
  Permission,
} from '@larcarvalho/shared';
import {
  BarChart3,
  BookOpen,
  Boxes,
  Building2,
  Calculator,
  CalendarClock,
  ChevronDown,
  ClipboardCheck,
  Database,
  FileText,
  Handshake,
  HelpCircle,
  LayoutDashboard,
  Menu,
  PackageOpen,
  Palette,
  ShieldCheck,
  SlidersHorizontal,
  TableProperties,
  TrendingUp,
  UserRound,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';

import { adminThemeFromAppearance, type AdminTheme } from '@larcarvalho/shared';
import { adminThemeStyle, adminThemeAttributes } from '../lib/admin-theme';

import { roleLabels } from '../lib/identity';
import { cn } from '../lib/styles';
import { deriveAiContext } from '../lib/ai-context';
import { AiCopilot } from './ai-copilot';
import { BrandMark } from './brand-mark';
import { LogoutButton } from './logout-button';

interface NavigationItem {
  readonly href: string;
  readonly icon: ComponentType<{ className?: string }>;
  readonly label: string;
  readonly permission?: Permission;
  readonly anyPermissions?: readonly Permission[];
}

interface NavigationGroup {
  readonly items: readonly NavigationItem[];
  readonly label: string;
}

export const navigation: readonly NavigationGroup[] = [
  {
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Visão geral', permission: 'dashboard.read' },
    ],
    label: 'Principal',
  },
  {
    items: [
      {
        href: '/dashboard/administradoras',
        icon: Building2,
        label: 'Administradoras',
        permission: 'administradoras.read',
      },
      {
        href: '/dashboard/produtos',
        icon: PackageOpen,
        label: 'Produtos',
        permission: 'produtos.read',
      },
      {
        href: '/dashboard/grupos',
        icon: Boxes,
        label: 'Grupos',
        permission: 'grupos.read',
      },
      {
        href: '/dashboard/cotas',
        icon: ClipboardCheck,
        label: 'Cotas',
        permission: 'cotas.read',
      },
      {
        href: '/dashboard/assembleias',
        icon: ClipboardCheck,
        label: 'Assembleias',
        permission: 'assembleias.read',
      },
    ],
    label: 'Operação',
  },
  {
    items: [
      {
        href: '/dashboard/tabelas-comerciais',
        icon: TableProperties,
        label: 'Tabelas comerciais',
        permission: 'tabelas_comerciais.read',
      },
      {
        href: '/dashboard/gestao-comercial',
        icon: BarChart3,
        label: 'Gestao Comercial',
        anyPermissions: ['sales.read_all', 'sales.read_team', 'sales.read_own'],
      },
      {
        href: '/dashboard/crm',
        icon: TrendingUp,
        label: 'CRM',
        anyPermissions: ['leads.read_all', 'leads.read_team', 'leads.read_own'],
      },
      {
        href: '/dashboard/carteira',
        icon: Users,
        label: 'Carteira',
        anyPermissions: ['leads.read_all', 'leads.read_team', 'leads.read_own'],
      },
      {
        href: '/dashboard/agenda',
        icon: CalendarClock,
        label: 'Agenda',
        anyPermissions: ['leads.read_all', 'leads.read_team', 'leads.read_own'],
      },
      {
        href: '/simulacoes/nova',
        icon: Calculator,
        label: 'Nova simulação',
        permission: 'simulations.create',
      },
      {
        href: '/propostas',
        icon: FileText,
        label: 'Propostas',
        anyPermissions: ['proposals.read_all', 'proposals.read_team', 'proposals.read_own'],
      },
      {
        href: '/dashboard/vendas',
        icon: Handshake,
        label: 'Vendas',
        anyPermissions: ['sales.read_all', 'sales.read_team', 'sales.read_own'],
      },
      {
        href: '/dashboard/comissoes',
        icon: Wallet,
        label: 'Comissões',
        permission: 'commissions.read',
      },
      {
        href: '/configuracoes/comercial',
        icon: SlidersHorizontal,
        label: 'Configuração comercial',
        permission: 'commercial_config.read',
      },
      {
        href: '/configuracoes/aparencia',
        icon: Palette,
        label: 'Aparencia',
        anyPermissions: ['themes.public.manage', 'themes.admin.manage'],
      },
    ],
    label: 'Comercial',
  },
  {
    items: [
      {
        href: '/dashboard/comparador',
        icon: BarChart3,
        label: 'Comparador',
        permission: 'comparador.read',
      },
      {
        href: '/dashboard/base-conhecimento',
        icon: BookOpen,
        label: 'Base de conhecimento',
        permission: 'knowledge.read',
      },
    ],
    label: 'Inteligência',
  },
  {
    items: [
      {
        href: '/dashboard/importacoes',
        icon: Database,
        label: 'Importações',
        permission: 'importacoes.read',
      },
      {
        href: '/dashboard/qualidade-dados',
        icon: ShieldCheck,
        label: 'Qualidade dos Dados',
        permission: 'data_quality.read',
      },
      {
        href: '/dashboard/users',
        icon: Users,
        label: 'Usuários',
        permission: 'users.read',
      },
      {
        href: '/dashboard/teams', icon: Users, label: 'Equipes', permission: 'teams.read',
      },
      {
        href: '/dashboard/integracoes',
        icon: Database,
        label: 'Integrações',
        permission: 'integrations.read',
      },
    ],
    label: 'Administração',
  },
  {
    items: [
      {
        href: '/dashboard/audit',
        icon: ShieldCheck,
        label: 'Auditoria',
        permission: 'audit.read',
      },
      {
        href: '/minha-conta',
        icon: UserRound,
        label: 'Minha conta',
      },
      {
        href: '/ajuda',
        icon: HelpCircle,
        label: 'Ajuda',
      },
    ],
    label: 'Sistema',
  },
];

export function visibleNavigation(
  identity: AuthResponse,
): readonly NavigationGroup[] {
  const permissionSet = new Set(identity.permissions);
  return navigation
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          (!item.permission || permissionSet.has(item.permission)) &&
          (!item.anyPermissions || item.anyPermissions.some((permission) => permissionSet.has(permission))),
      ),
    }))
    .filter((group) => group.items.length > 0);
}

const pageTitles: Record<string, string> = {
  '/dashboard': 'Visão geral',
  '/dashboard/administradoras': 'Administradoras',
  '/dashboard/produtos': 'Produtos',
  '/dashboard/grupos': 'Grupos',
  '/dashboard/cotas': 'Cotas',
  '/dashboard/assembleias': 'Assembleias',
  '/dashboard/forbidden': 'Acesso não autorizado',
  '/dashboard/profile': 'Meu perfil',
  '/minha-conta': 'Minha conta',
  '/ajuda': 'Central de ajuda',
  '/dashboard/users': 'Usuários',
  '/dashboard/crm': 'CRM',
  '/dashboard/carteira': 'Carteira',
  '/dashboard/agenda': 'Agenda comercial',
  '/dashboard/gestao-comercial': 'Gestao Comercial',
  '/dashboard/base-conhecimento': 'Base de conhecimento',
  '/dashboard/integracoes': 'Integrações',
  '/dashboard/tabelas-comerciais': 'Tabelas comerciais',
  '/simulacoes/nova': 'Nova simulação',
  '/propostas': 'Propostas comerciais',
  '/configuracoes/comercial': 'Configuração comercial',
  '/configuracoes/aparencia': 'Aparencia',
};

function pageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  if (pathname.startsWith('/simulacoes/')) return 'Detalhes da simulação';
  if (pathname.startsWith('/propostas/')) return 'Detalhes da proposta';
  if (pathname.startsWith('/dashboard/clientes/')) return 'Cliente 360°';
  const item = navigation
    .flatMap((group) => group.items)
    .find(({ href }) => href === pathname);
  return item?.label ?? 'Larcarvalho Intelligence';
}

function Sidebar({
  agendaBadge,
  appearance,
  identity,
  mobile,
  onNavigate,
}: {
  readonly agendaBadge?: number | null;
  readonly appearance?: AppearanceConfiguration | null | undefined;
  readonly identity: AuthResponse;
  readonly mobile?: boolean;
  readonly onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <aside
      aria-label="Navegação principal"
      className={cn(
        'app-navigation flex h-full w-[var(--sidebar-width)] flex-col border-r border-[var(--color-border)] bg-white',
        mobile && 'shadow-2xl',
      )}
    >
      <div className="flex h-20 items-center justify-between px-5">
        <BrandMark
          commercialName={appearance?.commercialName}
          logoUrl={appearance?.logoUrl}
        />
        {mobile ? (
          <button
            aria-label="Fechar menu"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            onClick={onNavigate}
            type="button"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        ) : null}
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-5">
        {visibleNavigation(identity).map((group) => (
          <div className="mt-5 first:mt-1" key={group.label}>
            <p className="px-3 text-[0.68rem] font-bold tracking-[0.12em] text-[var(--color-muted)] uppercase">
              {group.label}
            </p>
            <ul className="mt-2 space-y-0.5">
              {group.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== '/dashboard' &&
                    pathname.startsWith(`${item.href}/`));
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex min-h-10 items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium',
                        active
                          ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary)]'
                          : 'text-[var(--color-text-soft)] hover:bg-slate-50 hover:text-[var(--color-text)]',
                      )}
                      href={item.href}
                      {...(onNavigate ? { onClick: onNavigate } : {})}
                    >
                      <Icon
                        aria-hidden="true"
                        className="h-[1.1rem] w-[1.1rem] shrink-0"
                      />
                      <span>{item.label}</span>
                      {item.href === '/dashboard/agenda' &&
                      agendaBadge !== null &&
                      agendaBadge !== undefined &&
                      agendaBadge > 0 ? (
                        <span
                          aria-label={`${agendaBadge} pendências na agenda`}
                          className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-[var(--color-danger)] px-1 text-[0.68rem] font-bold text-white"
                        >
                          {agendaBadge > 99 ? '99+' : agendaBadge}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-[var(--color-border)] p-4">
        <p className="text-xs text-[var(--color-muted)]">Ambiente interno</p>
        <p className="mt-0.5 text-xs font-medium text-[var(--color-text-soft)]">
          Larcarvalho Consórcios
        </p>
      </div>
    </aside>
  );
}

export function AppShell({
  adminTheme,
  appearance,
  children,
  identity,
}: {
  readonly adminTheme?: AdminTheme | null | undefined;
  readonly appearance?: AppearanceConfiguration | null | undefined;
  readonly children: ReactNode;
  readonly identity: AuthResponse;
}) {
  const pathname = usePathname();
  const aiContext = deriveAiContext(pathname);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Badge de pendências da agenda (atrasados + hoje). Falha silenciosa:
  // nunca pode quebrar a navegação.
  const [agendaBadge, setAgendaBadge] = useState<number | null>(null);
  useEffect(() => {
    const canSee = ['leads.read_own', 'leads.read_team', 'leads.read_all'].some(
      (permission) =>
        (identity.permissions as readonly string[]).includes(permission),
    );
    if (!canSee) return;
    let cancelled = false;
    fetch('/api/agenda?days=7&page=1&pageSize=1', { headers: { accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok || cancelled) return;
        const payload = (await response.json()) as {
          totals?: { overdue?: unknown; today?: unknown };
        };
        const overdue = typeof payload.totals?.overdue === 'number' ? payload.totals.overdue : 0;
        const today = typeof payload.totals?.today === 'number' ? payload.totals.today : 0;
        setAgendaBadge(overdue + today);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [identity.permissions]);
  const mobileDialog = useRef<HTMLDialogElement>(null);
  const resolvedTheme = adminTheme ?? adminThemeFromAppearance(appearance);
  const appearanceStyle = adminThemeStyle(resolvedTheme);

  useEffect(() => {
    if (!mobileOpen) return;
    mobileDialog.current?.showModal();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <div
      className="app-shell admin-theme min-h-screen bg-[var(--color-background)] lg:pl-[var(--sidebar-width)]"
      style={appearanceStyle}
      {...adminThemeAttributes(resolvedTheme)}
    >
      <a
        className="skip-link sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:p-3"
        href="#main-content"
      >
        Ir para o conteúdo
      </a>
      <div className="fixed inset-y-0 left-0 z-30 hidden lg:block">
        <Sidebar agendaBadge={agendaBadge} appearance={appearance} identity={identity} />
      </div>
      {mobileOpen ? (
        <dialog
          ref={mobileDialog}
          aria-label="Menu de navegação"
          onCancel={(event) => {
            event.preventDefault();
            setMobileOpen(false);
          }}
          className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-transparent p-0 lg:hidden"
        >
          <button
            aria-label="Fechar menu"
            className="absolute inset-0 bg-slate-950/40"
            onClick={() => setMobileOpen(false)}
            type="button"
          />
          <div className="relative h-full w-fit">
            <Sidebar
              agendaBadge={agendaBadge}
              appearance={appearance}
              identity={identity}
              mobile
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </dialog>
      ) : null}
      <header className="app-header sticky top-0 z-20 flex h-20 items-center justify-between gap-4 border-b border-[var(--color-border)] bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            aria-expanded={mobileOpen}
            aria-label="Abrir menu"
            className="rounded-lg border border-[var(--color-border)] p-2 text-slate-600 hover:bg-slate-50 lg:hidden"
            onClick={() => setMobileOpen(true)}
            type="button"
          >
            <Menu aria-hidden="true" className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <nav
              aria-label="Caminho da página"
              className="flex gap-2 text-xs font-medium text-[var(--color-muted)]"
            >
              <Link href="/dashboard">Início</Link>
              <span aria-hidden="true">/</span>
              <span aria-current="page">{pageTitle(pathname)}</span>
            </nav>
            <h1 className="truncate text-lg font-semibold tracking-tight">
              {pageTitle(pathname)}
            </h1>
          </div>
        </div>
        <details className="group relative">
          <summary className="flex list-none items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--color-primary-soft)] text-sm font-bold text-[var(--color-primary)]">
              {identity.user.nome.charAt(0).toUpperCase()}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block max-w-40 truncate text-sm font-semibold">
                {identity.user.nome}
              </span>
              <span className="block text-xs text-[var(--color-muted)]">
                {roleLabels[identity.user.role]}
              </span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className="hidden h-4 w-4 text-slate-400 sm:block"
            />
          </summary>
          <div className="absolute right-0 mt-2 w-64 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-2 shadow-[var(--shadow-md)]">
            <div className="border-b border-[var(--color-border)] px-3 py-2">
              <p className="truncate text-sm font-semibold">
                {identity.user.nome}
              </p>
              <p className="truncate text-xs text-[var(--color-muted)]">
                {identity.user.email}
              </p>
            </div>
            <Link
              className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--color-text-soft)] hover:bg-slate-50"
              href="/dashboard/profile"
            >
              <UserRound aria-hidden="true" className="h-4 w-4" /> Meu perfil
            </Link>
            <LogoutButton className="mt-1 w-full justify-start" />
          </div>
        </details>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-[100rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
      >
        {children}
      </main>
      <AiCopilot
        contextLabel={aiContext.label}
        contextType={aiContext.type}
        permissions={identity.permissions}
        {...(aiContext.id ? { contextId: aiContext.id } : {})}
      />
    </div>
  );
}
