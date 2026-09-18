import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { DataQualityActions } from '../../../../components/data-quality-actions';
import { PageHeader } from '../../../../components/page-header';
import { Badge } from '../../../../components/ui/badge';
import { Card } from '../../../../components/ui/card';
import { getCurrentIdentity } from '../../../../services/api/auth';
import { getDataQualityIssue } from '../../../../services/api/data-quality';
export const dynamic = 'force-dynamic';
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  if (!identity.permissions.includes('data_quality.read'))
    redirect('/dashboard/forbidden');
  const issue = await getDataQualityIssue((await params).id);
  if (issue === 'not-found') notFound();
  if (typeof issue === 'string') redirect('/dashboard/forbidden');
  const rows = [
    ['Regra/código', issue.codigo],
    ['Entidade', issue.contexto.titulo],
    ['Campo', issue.campo ?? '—'],
    ['Valor recebido', issue.valorRecebido ?? '—'],
    ['Origem', issue.origem],
    ['Importação', issue.importacao?.nomeArquivo ?? '—'],
    [
      'Criada em',
      new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(issue.createdAt)),
    ],
    [
      'Resolvida em',
      issue.resolvedAt
        ? new Intl.DateTimeFormat('pt-BR', {
            dateStyle: 'short',
            timeStyle: 'short',
          }).format(new Date(issue.resolvedAt))
        : '—',
    ],
  ] as const;
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Investigação de qualidade"
        title={issue.codigo}
        description={issue.mensagem}
      />
      <Card className="p-6">
        <div className="mb-5 flex gap-2">
          <Badge
            tone={
              issue.severidade === 'CRITICAL' || issue.severidade === 'ERROR'
                ? 'danger'
                : issue.severidade === 'WARNING'
                  ? 'warning'
                  : 'info'
            }
          >
            {issue.severidade}
          </Badge>
          <Badge>{issue.status}</Badge>
        </div>
        <dl className="grid gap-5 md:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs uppercase text-slate-500">{label}</dt>
              <dd className="mt-1 break-words">{value}</dd>
            </div>
          ))}
        </dl>
        {issue.contexto.href ? (
          <Link
            className="mt-5 inline-block font-semibold text-[var(--color-primary)]"
            href={issue.contexto.href}
          >
            Abrir registro relacionado
          </Link>
        ) : null}
      </Card>
      <Card className="p-6">
        <h2 className="mb-4 font-semibold">Ações de saneamento</h2>
        <DataQualityActions identity={identity} issue={issue} />
      </Card>
      <Card>
        <div className="border-b p-5 font-semibold">Histórico de ações</div>
        {issue.historico.length ? (
          <ul className="divide-y">
            {issue.historico.map((event, index) => (
              <li className="p-4" key={`${event.createdAt}-${index}`}>
                <p className="font-medium">{event.action}</p>
                <p className="text-xs text-slate-500">
                  {new Intl.DateTimeFormat('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }).format(new Date(event.createdAt))}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-5 text-sm text-slate-500">Nenhuma ação registrada.</p>
        )}
      </Card>
    </div>
  );
}
