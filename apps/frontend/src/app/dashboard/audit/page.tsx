import { redirect } from 'next/navigation';
import { getCurrentIdentity } from '../../../services/api/auth';
import { getAccessAudit } from '../../../services/api/access-management';
import { PageHeader } from '../../../components/page-header';
import { Card } from '../../../components/ui/card';
import { Pagination } from '../../../components/ui/pagination';
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const identity = await getCurrentIdentity(); if (!identity) redirect('/login');
  if (!identity.permissions.includes('audit.read')) redirect('/dashboard/forbidden');
  const raw = Number((await searchParams).page ?? 1);
  const result = await getAccessAudit(Number.isInteger(raw) && raw > 0 ? raw : 1);
  if (typeof result === 'string') redirect(result === 'unauthorized' ? '/login' : '/dashboard/forbidden');
  return <div className="space-y-6"><PageHeader title="Auditoria" eyebrow="Gestão de acesso" description="Eventos de usuários, equipes, CRM e aparência registrados pelo sistema." /><Card className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-4">Data</th><th className="p-4">Responsável</th><th className="p-4">Ação</th><th className="p-4">Registro</th></tr></thead><tbody>{result.items.map((item) => <tr key={item.id} className="border-t border-[var(--color-border)]"><td className="p-4">{new Date(item.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })}</td><td className="p-4">{item.actor?.nome ?? 'Sistema'}</td><td className="p-4">{item.action}</td><td className="p-4">{item.entity}<span className="block text-xs text-[var(--color-muted)]">{item.entityId}</span></td></tr>)}</tbody></table>{!result.items.length && <p className="p-4">Nenhum evento registrado.</p>}<Pagination page={result.page} totalPages={result.totalPages} /></Card></div>;
}
