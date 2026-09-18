import {
  knowledgeDocumentDetailSchema,
  knowledgeDocumentListResponseSchema,
  knowledgeIngestionListResponseSchema,
  knowledgeSearchResponseSchema,
  type KnowledgeDocumentListQuery,
  type KnowledgeSearchQuery,
} from '@larcarvalho/shared';
import { cookies } from 'next/headers';
import { getFrontendConfig } from '../../config/env';

async function fetchKnowledge(path: string) {
  const config = getFrontendConfig();
  const response = await fetch(`${config.apiBaseUrl}/api/v1/knowledge${path}`, {
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      cookie: (await cookies()).toString(),
    },
    signal: AbortSignal.timeout(config.apiTimeoutMs),
  });
  return response;
}

export async function listKnowledgeDocuments(
  query: KnowledgeDocumentListQuery,
) {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.busca) params.set('busca', query.busca);
  if (query.categoria) params.set('categoria', query.categoria);
  if (query.status) params.set('status', query.status);
  if (query.visibilidade) params.set('visibilidade', query.visibilidade);
  if (query.tag) params.set('tag', query.tag);
  if (query.incluirArquivados)
    params.set('incluirArquivados', query.incluirArquivados);
  const response = await fetchKnowledge(`?${params.toString()}`);
  if (response.status === 401) return 'unauthorized' as const;
  if (response.status === 403) return 'forbidden' as const;
  if (!response.ok) throw new Error('Falha ao carregar a base de conhecimento');
  return knowledgeDocumentListResponseSchema.parse(await response.json());
}

export async function getKnowledgeDocument(id: string) {
  const response = await fetchKnowledge(`/${encodeURIComponent(id)}`);
  if (response.status === 401) return 'unauthorized' as const;
  if (response.status === 403) return 'forbidden' as const;
  if (response.status === 404) return 'notFound' as const;
  if (!response.ok) throw new Error('Falha ao carregar o documento');
  return knowledgeDocumentDetailSchema.parse(await response.json());
}

export async function listKnowledgeIngestions(id: string) {
  const response = await fetchKnowledge(
    `/${encodeURIComponent(id)}/ingestions`,
  );
  if (response.status === 401) return 'unauthorized' as const;
  if (response.status === 403) return 'forbidden' as const;
  if (response.status === 404) return 'notFound' as const;
  if (!response.ok) throw new Error('Falha ao carregar as ingestões');
  return knowledgeIngestionListResponseSchema.parse(await response.json());
}

export async function searchKnowledge(query: KnowledgeSearchQuery) {
  const params = new URLSearchParams({ q: query.q, limit: String(query.limit) });
  if (query.category) params.set('category', query.category);
  if (query.documentId) params.set('documentId', query.documentId);
  const response = await fetchKnowledge(`/search?${params.toString()}`);
  if (response.status === 401) return 'unauthorized' as const;
  if (response.status === 403) return 'forbidden' as const;
  if (!response.ok) throw new Error('Falha ao pesquisar na base');
  return knowledgeSearchResponseSchema.parse(await response.json());
}
