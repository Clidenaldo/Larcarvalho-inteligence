import { deflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import type { AuthContext } from '../src/core/auth/auth-context.js';
import {
  canManageDocument,
  canViewDocument,
  knowledgeVisibilityFilter,
} from '../src/modules/knowledge/knowledge-authorization.js';
import {
  chunkKnowledgeText,
  checksumOf,
} from '../src/modules/knowledge/knowledge-chunker.js';
import {
  assertKnowledgeFile,
  extractKnowledgeText,
  KNOWLEDGE_MIN_TEXT_CHARS,
} from '../src/modules/knowledge/knowledge-parser.js';
import {
  InMemoryKnowledgeStorage,
  LocalKnowledgeStorage,
} from '../src/modules/knowledge/knowledge-storage.js';

function actor(
  overrides: Partial<AuthContext> & { role?: AuthContext['user']['role'] } = {},
): AuthContext {
  const { role = 'GESTOR', ...rest } = overrides;
  return {
    sessionId: 'session-1',
    teamIds: ['team-a'],
    user: {
      email: 'user@example.com',
      id: '11111111-1111-1111-1111-111111111111',
      nome: 'User Example',
      role,
    },
    ...rest,
  };
}

function compressedPdf(text: string): Buffer {
  const content = `BT /F1 12 Tf 72 700 Td (${text}) Tj ET`;
  const stream = deflateSync(Buffer.from(content, 'latin1'));
  const head = Buffer.from(
    '%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n' +
      '2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n' +
      '3 0 obj<< /Type /Page /Contents 4 0 R >>endobj\n' +
      '4 0 obj<< /Length 0 /Filter /FlateDecode >>stream\n',
    'latin1',
  );
  const tail = Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1');
  return Buffer.concat([head, stream, tail]);
}

describe('knowledge parser', () => {
  it('accepts txt and markdown and rejects mismatched content', () => {
    const txt = Buffer.from('Regulamento interno de lances do consorcio.', 'utf8');
    expect(assertKnowledgeFile('regra.txt', 'text/plain', txt)).toBe('text');
    expect(
      assertKnowledgeFile('regra.md', 'text/markdown', txt),
    ).toBe('markdown');
    expect(() =>
      assertKnowledgeFile('regra.txt', 'application/pdf', txt),
    ).toThrowError('MIME_MISMATCH');
    expect(() =>
      assertKnowledgeFile('regra.pdf', 'application/pdf', txt),
    ).toThrowError('CONTENT_MISMATCH');
    expect(() =>
      assertKnowledgeFile('regra.docx', 'application/msword', txt),
    ).toThrowError('UNSUPPORTED_FORMAT');
    expect(() =>
      assertKnowledgeFile('vazio.txt', 'text/plain', Buffer.alloc(0)),
    ).toThrowError('EMPTY_FILE');
  });

  it('extracts text from a deflate-compressed PDF stream', () => {
    const pdf = compressedPdf(
      'O lance fixo e de 25 por cento do valor da carta de credito',
    );
    const extracted = extractKnowledgeText('pdf', pdf);
    expect(extracted.text).toContain('25 por cento');
    expect(extracted.pages).toHaveLength(1);
  });

  it('returns no pages for an image-only PDF', () => {
    const pdf = Buffer.from(
      '%PDF-1.4\n1 0 obj<< /Type /Page >>endobj\n%%EOF',
      'latin1',
    );
    const extracted = extractKnowledgeText('pdf', pdf);
    expect(extracted.text.length).toBeLessThan(KNOWLEDGE_MIN_TEXT_CHARS);
  });

  it('keeps unicode content for txt uploads', () => {
    const extracted = extractKnowledgeText(
      'text',
      Buffer.from('Assembleia de contemplação — lance de 25%.', 'utf8'),
    );
    expect(extracted.text).toContain('contemplação');
  });
});

describe('knowledge chunker', () => {
  it('tracks markdown sections and page numbers deterministically', () => {
    const page = [
      '# Regras de lance',
      'O lance fixo corresponde a 25 por cento do valor da carta.',
      'O lance livre permite escolher o percentual ofertado.',
      '## Contemplação',
      'A contemplação ocorre por sorteio ou lance em assembleia.',
    ].join('\n');
    const chunks = chunkKnowledgeText([page]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.section).toBe('Regras de lance');
    expect(chunks[0]?.page).toBe(1);
    expect(chunks[0]?.ordinal).toBe(0);
    expect(chunks[0]?.tokens).toBeGreaterThan(0);
  });

  it('splits long content with overlap and stable hashes', () => {
    const paragraph = 'Palavra '.repeat(400).trim();
    const chunks = chunkKnowledgeText([paragraph], {
      maxChars: 500,
      overlapChars: 100,
    });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.contentHash).toHaveLength(64);
      expect(checksumOf(Buffer.from(chunk.content, 'utf8'))).toBe(
        chunk.contentHash,
      );
    }
    expect(chunks.map((chunk) => chunk.ordinal)).toEqual(
      chunks.map((_, index) => index),
    );
  });

  it('assigns page numbers per page', () => {
    const chunks = chunkKnowledgeText(['Primeira pagina', 'Segunda pagina']);
    expect(chunks.map((chunk) => chunk.page)).toEqual([1, 2]);
  });
});

describe('knowledge authorization', () => {
  const base = {
    ownerUserId: '22222222-2222-2222-2222-222222222222',
    status: 'READY' as const,
    teamId: 'team-a',
    visibility: 'PUBLIC' as const,
  };

  it('allows public documents for any reader', () => {
    expect(canViewDocument(actor({ teamIds: [] }), base)).toBe(true);
  });

  it('restricts private documents to the owner or managers', () => {
    const owned = {
      ...base,
      ownerUserId: actor().user.id,
      visibility: 'PRIVATE' as const,
    };
    const foreign = { ...base, visibility: 'PRIVATE' as const };
    expect(canViewDocument(actor({ teamIds: [] }), owned)).toBe(true);
    expect(canViewDocument(actor({ teamIds: [] }), foreign)).toBe(false);
  });

  it('restricts team documents to the team or managers', () => {
    const team = { ...base, visibility: 'TEAM' as const };
    expect(canViewDocument(actor(), team)).toBe(true);
    expect(canViewDocument(actor({ teamIds: [] }), team)).toBe(false);
    expect(canManageDocument(actor(), team)).toBe(true);
    expect(canManageDocument(actor({ teamIds: [] }), team)).toBe(false);
  });

  it('lets knowledge.manage see everything', () => {
    const admin = actor({ role: 'ADMIN', teamIds: [] });
    expect(canViewDocument(admin, { ...base, visibility: 'PRIVATE' })).toBe(
      true,
    );
    expect(knowledgeVisibilityFilter(admin)).toEqual({});
    expect(knowledgeVisibilityFilter(actor())).toHaveProperty('OR');
  });
});

describe('knowledge storage', () => {
  it('saves, reads and removes files in memory', async () => {
    const storage = new InMemoryKnowledgeStorage();
    await storage.save({ buffer: Buffer.from('doc'), key: 'documents/a.txt' });
    expect((await storage.read('documents/a.txt')).toString()).toBe('doc');
    await storage.remove('documents/a.txt');
    await expect(storage.read('documents/a.txt')).rejects.toThrow();
  });

  it('blocks path traversal outside the base directory', async () => {
    const storage = new LocalKnowledgeStorage(process.cwd());
    await expect(
      storage.save({
        buffer: Buffer.from('x'),
        key: '../../escape.txt',
      }),
    ).rejects.toThrowError('KNOWLEDGE_STORAGE_PATH_INVALID');
  });
});
