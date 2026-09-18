import { describe, expect, it } from 'vitest';

import {
  createKnowledgeTextRequestSchema,
  knowledgeDocumentListQuerySchema,
  knowledgeDocumentSchema,
  knowledgeSearchQuerySchema,
  knowledgeSearchResponseSchema,
  knowledgeUploadMetadataSchema,
  updateKnowledgeDocumentRequestSchema,
} from '../src/index.js';

const baseDocument = {
  id: '3343309c-541f-4457-8d6b-a42f7e02bd9c',
  title: 'Regulamento de lances',
  description: null,
  category: 'REGULAMENTO',
  visibility: 'PUBLIC',
  status: 'READY',
  sourceType: 'UPLOAD',
  originalName: 'regulamento.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  checksum: 'a'.repeat(64),
  ownerUserId: '3343309c-541f-4457-8d6b-a42f7e02bd9d',
  ownerName: 'Gestor',
  teamId: null,
  teamName: null,
  version: 1,
  documentGroupId: '3343309c-541f-4457-8d6b-a42f7e02bd9e',
  tags: ['lances'],
  chunkCount: 3,
  createdAt: '2026-09-15T12:00:00.000Z',
  updatedAt: '2026-09-15T12:00:00.000Z',
  processedAt: '2026-09-15T12:00:00.000Z',
  failureReason: null,
} as const;

describe('knowledge base contracts', () => {
  it('validates a complete knowledge document', () => {
    expect(knowledgeDocumentSchema.parse(baseDocument)).toEqual(baseDocument);
    expect(
      knowledgeDocumentSchema.safeParse({ ...baseDocument, category: 'API' })
        .success,
    ).toBe(false);
    expect(
      knowledgeDocumentSchema.safeParse({ ...baseDocument, visibility: 'OPEN' })
        .success,
    ).toBe(false);
  });

  it('defaults upload metadata visibility to public and caps tags', () => {
    expect(
      knowledgeUploadMetadataSchema.parse({
        title: 'Manual do consorciado',
        category: 'MANUAL',
      }),
    ).toMatchObject({ visibility: 'PUBLIC' });
    expect(() =>
      knowledgeUploadMetadataSchema.parse({
        title: 'x',
        category: 'MANUAL',
      }),
    ).toThrow();
    expect(() =>
      knowledgeUploadMetadataSchema.parse({
        title: 'Manual do consorciado',
        category: 'MANUAL',
        tags: Array.from({ length: 21 }, (_, index) => `tag-${index}`),
      }),
    ).toThrow();
  });

  it('requires a minimum body for text documents and rejects mass assignment', () => {
    expect(() =>
      createKnowledgeTextRequestSchema.parse({
        title: 'Regra de lance',
        category: 'REGULAMENTO',
        content: 'curto',
      }),
    ).toThrow();
    const parsed = createKnowledgeTextRequestSchema.parse({
      title: 'Regra de lance',
      category: 'REGULAMENTO',
      content: 'O lance fixo corresponde a 25% da carta de crédito.',
    });
    expect(parsed.visibility).toBe('PUBLIC');
    expect(() =>
      updateKnowledgeDocumentRequestSchema.parse({
        title: 'Regra atualizada',
        ownerUserId: baseDocument.ownerUserId,
      }),
    ).toThrow();
  });

  it('coerces list and search pagination with safe bounds', () => {
    expect(knowledgeDocumentListQuerySchema.parse({})).toMatchObject({
      page: 1,
      pageSize: 20,
    });
    expect(() =>
      knowledgeDocumentListQuerySchema.parse({ pageSize: '500' }),
    ).toThrow();
    expect(knowledgeSearchQuerySchema.parse({ q: 'lance' })).toMatchObject({
      limit: 5,
    });
    expect(() => knowledgeSearchQuerySchema.parse({ q: 'a' })).toThrow();
    expect(() =>
      knowledgeSearchQuerySchema.parse({ q: 'lance', limit: '50' }),
    ).toThrow();
  });

  it('represents ungrounded search responses explicitly', () => {
    const response = {
      query: 'qual o lance fixo',
      mode: 'LEXICAL',
      semanticEnabled: false,
      grounded: false,
      message: 'Não encontrei informação suficiente nas fontes disponíveis.',
      total: 0,
      results: [],
    };
    expect(knowledgeSearchResponseSchema.parse(response)).toEqual(response);
  });
});
