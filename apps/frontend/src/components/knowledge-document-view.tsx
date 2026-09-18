import type {
  KnowledgeChunk,
  KnowledgeDocumentDetail,
  KnowledgeIngestion,
} from '@larcarvalho/shared';
import { FileText, ListTree } from 'lucide-react';

import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { EmptyState } from './ui/empty-state';

const date = (value: string | null) =>
  value ? new Date(value).toLocaleString('pt-BR') : 'Não informado';

function Chunk({ chunk }: { readonly chunk: KnowledgeChunk }) {
  return (
    <li className="border-b border-[var(--color-border)] p-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
          Trecho {chunk.ordinal + 1}
        </span>
        <span className="text-xs text-[var(--color-muted)]">
          {chunk.tokens} tokens
          {chunk.page ? ` · página ${chunk.page}` : ''}
          {chunk.section ? ` · ${chunk.section}` : ''}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 whitespace-pre-wrap">
        {chunk.content}
      </p>
    </li>
  );
}

export function KnowledgeDocumentView({
  document,
  ingestions,
}: {
  readonly document: KnowledgeDocumentDetail;
  readonly ingestions: KnowledgeIngestion[];
}) {
  const metadata: [string, string][] = [
    ['Categoria', document.category],
    ['Visibilidade', document.visibility],
    ['Origem', document.sourceType],
    ['Versão', String(document.version)],
    ['Responsável', document.ownerName ?? 'Não informado'],
    ['Equipe', document.teamName ?? 'Não informado'],
    ['Arquivo', document.originalName ?? 'Texto digitado'],
    ['Tamanho', `${document.sizeBytes} bytes`],
    ['Criado em', date(document.createdAt)],
    ['Processado em', date(document.processedAt)],
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <h3 className="text-lg font-semibold">{document.title}</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
            {document.description ?? 'Sem descrição informada.'}
          </p>
          {document.tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {document.tags.map((tag) => (
                <Badge key={tag} tone="neutral">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
          {document.failureReason ? (
            <p className="mt-4 text-sm text-[var(--color-danger)]">
              {document.failureReason}
            </p>
          ) : null}
        </Card>
        <Card className="p-5">
          <h3 className="flex items-center gap-2 font-semibold">
            <FileText className="h-4 w-4 text-[var(--color-primary)]" />
            Metadados
          </h3>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            {metadata.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-[var(--color-muted)]">{label}</dt>
                <dd className="font-medium break-words">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <h3 className="flex items-center gap-2 font-semibold">
            <ListTree className="h-4 w-4 text-[var(--color-primary)]" />
            Trechos indexados
          </h3>
          <span className="text-sm text-[var(--color-muted)]">
            {document.chunks.length} trecho(s)
          </span>
        </div>
        {document.chunks.length === 0 ? (
          <EmptyState
            description="O documento ainda não possui trechos indexados ou o processamento falhou."
            title="Sem trechos"
          />
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {document.chunks.map((chunk) => (
              <Chunk chunk={chunk} key={chunk.id} />
            ))}
          </ul>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-[var(--color-border)] px-5 py-4">
          <h3 className="font-semibold">Histórico de ingestão</h3>
        </div>
        {ingestions.length === 0 ? (
          <EmptyState
            description="Nenhuma ingestão registrada para este documento."
            title="Sem ingestões"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="text-xs tracking-wide text-[var(--color-muted)] uppercase">
                  {['Status', 'Trechos criados', 'Erro', 'Início', 'Fim'].map(
                    (heading) => (
                      <th className="border-b p-3" key={heading}>
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {ingestions.map((ingestion) => (
                  <tr key={ingestion.id}>
                    <td className="border-b p-3">{ingestion.status}</td>
                    <td className="border-b p-3">{ingestion.chunksCreated}</td>
                    <td className="border-b p-3 text-[var(--color-muted)]">
                      {ingestion.error ?? '—'}
                    </td>
                    <td className="border-b p-3">{date(ingestion.startedAt)}</td>
                    <td className="border-b p-3">{date(ingestion.finishedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
