import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { KnowledgeDocumentView } from '../../../../components/knowledge-document-view';
import { PageHeader } from '../../../../components/page-header';
import { Badge } from '../../../../components/ui/badge';
import { getCurrentIdentity } from '../../../../services/api/auth';
import {
  getKnowledgeDocument,
  listKnowledgeIngestions,
} from '../../../../services/api/knowledge-base';

export const dynamic = 'force-dynamic';

export default async function KnowledgeDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  if (!identity.permissions.includes('knowledge.read'))
    redirect('/dashboard/forbidden');
  const document = await getKnowledgeDocument(id);
  if (document === 'unauthorized') redirect('/login');
  if (document === 'forbidden') redirect('/dashboard/forbidden');
  if (document === 'notFound') notFound();
  const ingestions = await listKnowledgeIngestions(id);
  const ingestionItems = typeof ingestions === 'object' ? ingestions.items : [];

  return (
    <div className="space-y-7">
      <Link
        className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-primary)] hover:underline"
        href="/dashboard/base-conhecimento"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para a base de conhecimento
      </Link>
      <PageHeader
        actions={<Badge tone="info">{document.status}</Badge>}
        eyebrow="Base de conhecimento"
        title={document.title}
        description="Conteúdo, trechos indexados e histórico de ingestão do documento autorizado."
      />
      <KnowledgeDocumentView
        document={document}
        ingestions={ingestionItems}
      />
    </div>
  );
}
