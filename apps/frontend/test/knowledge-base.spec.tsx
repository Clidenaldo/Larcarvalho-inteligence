import type {
  KnowledgeDocument,
  KnowledgeDocumentDetail,
  KnowledgeIngestion,
} from '@larcarvalho/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { KnowledgeBaseManager } from '../src/components/knowledge-base-manager';
import { KnowledgeDocumentView } from '../src/components/knowledge-document-view';

const documentId = '11111111-1111-1111-1111-111111111111';
const chunkId = '22222222-2222-2222-2222-222222222222';

const document: KnowledgeDocument = {
  id: documentId,
  title: 'Regulamento de imóveis',
  description: 'Regras vigentes de contemplação.',
  category: 'REGULAMENTO',
  visibility: 'PUBLIC',
  status: 'READY',
  sourceType: 'UPLOAD',
  originalName: 'regulamento.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 2048,
  checksum: 'abc',
  ownerUserId: null,
  ownerName: 'Maria',
  teamId: null,
  teamName: null,
  version: 1,
  documentGroupId: '33333333-3333-3333-3333-333333333333',
  tags: ['imóvel', 'contemplação'],
  chunkCount: 1,
  createdAt: '2026-09-17T12:00:00.000Z',
  updatedAt: '2026-09-17T12:00:00.000Z',
  processedAt: '2026-09-17T12:00:00.000Z',
  failureReason: null,
};

const detail: KnowledgeDocumentDetail = {
  ...document,
  chunks: [
    {
      id: chunkId,
      documentId,
      ordinal: 0,
      content: 'A contemplação ocorre por sorteio ou lance.',
      section: 'Contemplação',
      page: 3,
      tokens: 12,
      createdAt: '2026-09-17T12:00:00.000Z',
    },
  ],
};

const ingestions: KnowledgeIngestion[] = [
  {
    id: '44444444-4444-4444-4444-444444444444',
    documentId,
    status: 'READY',
    chunksCreated: 1,
    error: null,
    startedAt: '2026-09-17T12:00:00.000Z',
    finishedAt: '2026-09-17T12:00:01.000Z',
    createdAt: '2026-09-17T12:00:00.000Z',
  },
];

describe('knowledge base UI', () => {
  it('renders chunks, metadata and ingestion history', () => {
    const html = renderToStaticMarkup(
      <KnowledgeDocumentView document={detail} ingestions={ingestions} />,
    );
    expect(html).toContain('A contemplação ocorre por sorteio ou lance.');
    expect(html).toContain('Contemplação');
    expect(html).toContain('página 3');
    expect(html).toContain('imóvel');
    expect(html).toContain('regulamento.pdf');
    expect(html).toContain('Histórico de ingestão');
    expect(html).toContain('READY');
  });

  it('lists authorized documents without create or search controls', () => {
    const html = renderToStaticMarkup(
      <KnowledgeBaseManager
        canArchive={false}
        canCreate={false}
        canSearch={false}
        documents={[document]}
        page={1}
        paginationParams={{}}
        total={1}
        totalPages={1}
      />,
    );
    expect(html).toContain('Regulamento de imóveis');
    expect(html).toContain(`/dashboard/base-conhecimento/${documentId}`);
    expect(html).toContain('Regulamento');
    expect(html).not.toContain('Pesquisar na base');
    expect(html).not.toContain('Adicionar documento em texto');
    expect(html).not.toContain('Arquivar');
  });

  it('exposes search and creation to authorized users', () => {
    const html = renderToStaticMarkup(
      <KnowledgeBaseManager
        canArchive
        canCreate
        canSearch
        documents={[document]}
        page={1}
        paginationParams={{}}
        total={1}
        totalPages={1}
      />,
    );
    expect(html).toContain('Pesquisar na base');
    expect(html).toContain('Adicionar documento em texto');
    expect(html).toContain('Enviar arquivo');
    expect(html).toContain('Arquivar');
  });
});
