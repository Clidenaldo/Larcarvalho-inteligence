import {
  knowledgeCategories,
  knowledgeDocumentListQuerySchema,
  knowledgeDocumentStatuses,
  knowledgeVisibilities,
} from '@larcarvalho/shared';
import { redirect } from 'next/navigation';

import { KnowledgeBaseManager } from '../../../components/knowledge-base-manager';
import { PageHeader } from '../../../components/page-header';
import { Button } from '../../../components/ui/button';
import { Field, Input, Select } from '../../../components/ui/field';
import { getCurrentIdentity } from '../../../services/api/auth';
import { listKnowledgeDocuments } from '../../../services/api/knowledge-base';

export const dynamic = 'force-dynamic';

const categoryLabels: Record<string, string> = {
  MANUAL: 'Manual',
  REGULAMENTO: 'Regulamento',
  TABELA: 'Tabela',
  PROCEDIMENTO: 'Procedimento',
  PRODUTO: 'Produto',
  COMERCIAL: 'Comercial',
  INSTITUCIONAL: 'Institucional',
  OUTRO: 'Outro',
};

const visibilityLabels: Record<string, string> = {
  PUBLIC: 'Público',
  TEAM: 'Equipe',
  PRIVATE: 'Privado',
};

export default async function KnowledgeBasePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const raw = await searchParams;
  const candidate = {
    busca: raw.busca || undefined,
    categoria: raw.categoria || undefined,
    status: raw.status || undefined,
    visibilidade: raw.visibilidade || undefined,
    tag: raw.tag || undefined,
    incluirArquivados:
      raw.incluirArquivados === 'true'
        ? 'true'
        : raw.incluirArquivados === 'false'
          ? 'false'
          : undefined,
    page: raw.page,
    pageSize: raw.pageSize,
  };
  const parsed = knowledgeDocumentListQuerySchema.safeParse(candidate);
  const query = parsed.success
    ? parsed.data
    : knowledgeDocumentListQuerySchema.parse({});
  const identity = await getCurrentIdentity();
  if (!identity) redirect('/login');
  const permissions = new Set(identity.permissions);
  if (!permissions.has('knowledge.read')) redirect('/dashboard/forbidden');
  const data = await listKnowledgeDocuments(query);
  if (data === 'unauthorized') redirect('/login');
  if (data === 'forbidden') redirect('/dashboard/forbidden');

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Inteligência"
        title="Base de conhecimento"
        description="Documentos institucionais autorizados, busca lexical e respostas fundamentadas da IA."
      />
      <form className="grid gap-3 border-y border-[var(--color-border)] py-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <Field helpKey="knowledge.search" label="Busca">
          <Input defaultValue={query.busca} name="busca" />
        </Field>
        <Field helpKey="filter.knowledgeCategory" label="Categoria">
          <Select defaultValue={query.categoria ?? ''} name="categoria">
            <option value="">Todas</option>
            {knowledgeCategories.map((category) => (
              <option key={category} value={category}>
                {categoryLabels[category]}
              </option>
            ))}
          </Select>
        </Field>
        <Field helpKey="filter.knowledgeStatus" label="Status">
          <Select defaultValue={query.status ?? ''} name="status">
            <option value="">Todos</option>
            {knowledgeDocumentStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </Select>
        </Field>
        <Field helpKey="filter.knowledgeVisibility" label="Visibilidade">
          <Select defaultValue={query.visibilidade ?? ''} name="visibilidade">
            <option value="">Todas</option>
            {knowledgeVisibilities.map((visibility) => (
              <option key={visibility} value={visibility}>
                {visibilityLabels[visibility]}
              </option>
            ))}
          </Select>
        </Field>
        <Field helpKey="knowledge.tags" label="Etiqueta">
          <Input defaultValue={query.tag} name="tag" />
        </Field>
        <Field helpKey="filter.archive" label="Arquivados">
          <Select
            defaultValue={query.incluirArquivados ?? ''}
            name="incluirArquivados"
          >
            <option value="">Não</option>
            <option value="true">Sim</option>
            <option value="false">Ocultar arquivados</option>
          </Select>
        </Field>
        <div className="self-end">
          <Button type="submit">Aplicar filtros</Button>
        </div>
      </form>
      <KnowledgeBaseManager
        canArchive={permissions.has('knowledge.archive')}
        canCreate={permissions.has('knowledge.create')}
        canSearch={permissions.has('knowledge.search')}
        documents={data.items}
        page={data.page}
        paginationParams={{
          busca: query.busca,
          categoria: query.categoria,
          status: query.status,
          visibilidade: query.visibilidade,
          tag: query.tag,
          incluirArquivados: query.incluirArquivados,
        }}
        total={data.total}
        totalPages={data.totalPages}
      />
    </div>
  );
}
