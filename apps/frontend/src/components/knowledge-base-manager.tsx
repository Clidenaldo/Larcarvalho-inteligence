'use client';

import type {
  KnowledgeCategory,
  KnowledgeDocument,
  KnowledgeSearchResponse,
  KnowledgeVisibility,
} from '@larcarvalho/shared';
import {
  knowledgeCategories,
  knowledgeErrorMessage,
  knowledgeVisibilities,
} from '@larcarvalho/shared';
import { Archive, FileUp, Search, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { EmptyState } from './ui/empty-state';
import { Field, Input, Select, Textarea } from './ui/field';
import { Pagination } from './ui/pagination';

const categoryLabels: Record<KnowledgeCategory, string> = {
  MANUAL: 'Manual',
  REGULAMENTO: 'Regulamento',
  TABELA: 'Tabela',
  PROCEDIMENTO: 'Procedimento',
  PRODUTO: 'Produto',
  COMERCIAL: 'Comercial',
  INSTITUCIONAL: 'Institucional',
  OUTRO: 'Outro',
};

const visibilityLabels: Record<KnowledgeVisibility, string> = {
  PUBLIC: 'Público',
  TEAM: 'Equipe',
  PRIVATE: 'Privado',
};

const statusTones = {
  PROCESSING: 'warning',
  READY: 'success',
  FAILED: 'danger',
  ARCHIVED: 'neutral',
} as const;

function apiError(body: unknown, fallback: string): string {
  if (
    body &&
    typeof body === 'object' &&
    'error' in body &&
    body.error &&
    typeof body.error === 'object' &&
    'message' in body.error &&
    typeof body.error.message === 'string'
  )
    return body.error.message;
  return fallback;
}

function errorForCode(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'KNOWLEDGE_CONFLICT':
      return knowledgeErrorMessage.conflict;
    case 'KNOWLEDGE_FILE_INVALID':
      return knowledgeErrorMessage.mimeMismatch;
    case 'KNOWLEDGE_EXTRACTION_FAILED':
      return knowledgeErrorMessage.insufficientText;
    case 'KNOWLEDGE_NOT_FOUND':
      return knowledgeErrorMessage.notFound;
    default:
      return fallback;
  }
}

interface ManagerProps {
  readonly canArchive: boolean;
  readonly canCreate: boolean;
  readonly canSearch: boolean;
  readonly documents: KnowledgeDocument[];
  readonly page: number;
  readonly paginationParams: Readonly<Record<string, string | undefined>>;
  readonly total: number;
  readonly totalPages: number;
}

export function KnowledgeBaseManager({
  canArchive,
  canCreate,
  canSearch,
  documents,
  page,
  paginationParams,
  total,
  totalPages,
}: ManagerProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<KnowledgeSearchResponse | null>(null);
  const [searching, setSearching] = useState(false);

  async function runSearch(data: FormData) {
    const q = String(data.get('q') ?? '').trim();
    if (q.length < 2) return;
    setSearching(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q, limit: '8' });
      const category = String(data.get('category') ?? '');
      if (category) params.set('category', category);
      const response = await fetch(
        `/api/knowledge/search?${params.toString()}`,
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(body, 'Falha ao pesquisar'));
      setSearch(body as KnowledgeSearchResponse);
    } catch (cause) {
      setSearch(null);
      setError(cause instanceof Error ? cause.message : 'Falha ao pesquisar');
    } finally {
      setSearching(false);
    }
  }

  async function submitText(data: FormData) {
    setBusy(true);
    setError(null);
    const tags = String(data.get('tags') ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    const payload = {
      title: String(data.get('title') ?? '').trim(),
      description: String(data.get('description') ?? '').trim() || null,
      category: String(data.get('category') ?? 'OUTRO'),
      visibility: String(data.get('visibility') ?? 'PUBLIC'),
      tags: tags.length ? tags : undefined,
      content: String(data.get('content') ?? ''),
    };
    try {
      const response = await fetch('/api/knowledge/text', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          errorForCode(body?.error?.code, apiError(body, 'Falha ao salvar')),
        );
      router.push(`/dashboard/base-conhecimento/${body.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao salvar');
    } finally {
      setBusy(false);
    }
  }

  async function submitUpload(data: FormData) {
    const file = data.get('arquivo');
    if (!(file instanceof File) || file.size === 0) {
      setError(knowledgeErrorMessage.emptyFile);
      return;
    }
    setBusy(true);
    setError(null);
    const tags = String(data.get('tags') ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    const metadata = {
      title: String(data.get('title') ?? '').trim(),
      description: String(data.get('description') ?? '').trim() || null,
      category: String(data.get('category') ?? 'OUTRO'),
      visibility: String(data.get('visibility') ?? 'PUBLIC'),
      tags: tags.length ? tags : undefined,
    };
    const form = new FormData();
    form.append('arquivo', file);
    form.append('metadata', JSON.stringify(metadata));
    try {
      const response = await fetch('/api/knowledge/upload', {
        method: 'POST',
        body: form,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          errorForCode(body?.error?.code, apiError(body, 'Falha ao enviar')),
        );
      router.push(`/dashboard/base-conhecimento/${body.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao enviar');
    } finally {
      setBusy(false);
    }
  }

  async function archive(id: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/knowledge/${id}/archive`, {
        method: 'POST',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(apiError(body, 'Falha ao arquivar'));
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao arquivar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <Card className="border-[var(--color-danger)] p-4">
          <p className="text-sm text-[var(--color-danger)]" role="alert">
            {error}
          </p>
        </Card>
      ) : null}

      {canSearch ? (
        <Card className="p-5">
          <h3 className="flex items-center gap-2 font-semibold">
            <Search className="h-4 w-4 text-[var(--color-primary)]" />
            Pesquisar na base
          </h3>
          <form
            action={(data) => void runSearch(data)}
            className="mt-4 grid gap-4 md:grid-cols-[2fr_1fr_auto] md:items-end"
          >
            <Field helpKey="knowledge.search" label="Termo ou pergunta" required>
              <Input name="q" placeholder="Como funciona o prazo de contemplação?" />
            </Field>
            <Field helpKey="filter.knowledgeCategory" label="Categoria">
              <Select defaultValue="" name="category">
                <option value="">Todas</option>
                {knowledgeCategories.map((category) => (
                  <option key={category} value={category}>
                    {categoryLabels[category]}
                  </option>
                ))}
              </Select>
            </Field>
            <Button loading={searching} type="submit">
              Pesquisar
            </Button>
          </form>
          {search ? (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-[var(--color-muted)]">
                {search.mode} · busca semântica{' '}
                {search.semanticEnabled ? 'ativa' : 'indisponível'} ·{' '}
                {search.total} trecho(s)
              </p>
              {search.results.length === 0 ? (
                <EmptyState
                  description={search.message ?? knowledgeErrorMessage.notFound}
                  title="Nenhum trecho encontrado"
                />
              ) : (
                search.results.map((result) => (
                  <Card
                    className="p-4"
                    key={result.chunkId}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        className="font-semibold text-[var(--color-primary)] hover:underline"
                        href={`/dashboard/base-conhecimento/${result.documentId}`}
                      >
                        {result.documentTitle}
                      </Link>
                      <Badge tone="info">
                        {categoryLabels[result.category]}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                      {result.excerpt}
                    </p>
                    <p className="mt-2 text-xs text-[var(--color-muted)]">
                      Trecho {result.ordinal + 1}
                      {result.page ? ` · página ${result.page}` : ''}
                      {result.section ? ` · ${result.section}` : ''} · relevância{' '}
                      {result.score.toFixed(2)}
                    </p>
                  </Card>
                ))
              )}
            </div>
          ) : null}
        </Card>
      ) : null}

      {canCreate ? (
        <details className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-5">
          <summary className="cursor-pointer font-semibold">
            Adicionar documento em texto
          </summary>
          <form
            action={(data) => void submitText(data)}
            className="mt-5 grid gap-4 md:grid-cols-2"
          >
            <Field helpKey="knowledge.title" label="Título" required>
              <Input maxLength={300} name="title" required />
            </Field>
            <Field helpKey="knowledge.category" label="Categoria" required>
              <Select defaultValue="OUTRO" name="category">
                {knowledgeCategories.map((category) => (
                  <option key={category} value={category}>
                    {categoryLabels[category]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field helpKey="knowledge.visibility" label="Visibilidade" required>
              <Select defaultValue="PUBLIC" name="visibility">
                {knowledgeVisibilities.map((visibility) => (
                  <option key={visibility} value={visibility}>
                    {visibilityLabels[visibility]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field helpKey="knowledge.tags" label="Etiquetas">
              <Input name="tags" placeholder="imóvel, prazo, contemplação" />
            </Field>
            <Field helpKey="knowledge.description" label="Descrição">
              <Input maxLength={2000} name="description" />
            </Field>
            <div className="md:col-span-2">
              <Field helpKey="knowledge.content" label="Conteúdo" required>
                <Textarea
                  minLength={20}
                  name="content"
                  placeholder="Cole o conteúdo revisado do documento…"
                  required
                />
              </Field>
            </div>
            <div className="md:col-span-2">
              <Button loading={busy} type="submit">
                Indexar documento
              </Button>
            </div>
          </form>
        </details>
      ) : null}

      {canCreate ? (
        <details className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-5">
          <summary className="flex cursor-pointer items-center gap-2 font-semibold">
            <FileUp className="h-4 w-4" />
            Enviar arquivo
          </summary>
          <form
            action={(data) => void submitUpload(data)}
            className="mt-5 grid gap-4 md:grid-cols-2"
          >
            <div className="md:col-span-2">
              <Field helpKey="knowledge.file" label="Arquivo (TXT, MD ou PDF)" required>
                <Input
                  accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
                  name="arquivo"
                  required
                  type="file"
                />
              </Field>
            </div>
            <Field helpKey="knowledge.title" label="Título" required>
              <Input maxLength={300} name="title" required />
            </Field>
            <Field helpKey="knowledge.category" label="Categoria" required>
              <Select defaultValue="OUTRO" name="category">
                {knowledgeCategories.map((category) => (
                  <option key={category} value={category}>
                    {categoryLabels[category]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field helpKey="knowledge.visibility" label="Visibilidade" required>
              <Select defaultValue="PUBLIC" name="visibility">
                {knowledgeVisibilities.map((visibility) => (
                  <option key={visibility} value={visibility}>
                    {visibilityLabels[visibility]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field helpKey="knowledge.tags" label="Etiquetas">
              <Input name="tags" placeholder="regulamento, setembro" />
            </Field>
            <div className="md:col-span-2">
              <Button loading={busy} type="submit" variant="secondary">
                <Upload className="h-4 w-4" />
                Enviar e indexar
              </Button>
            </div>
          </form>
        </details>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <h3 className="font-semibold">Documentos</h3>
          <span className="text-sm text-[var(--color-muted)]">
            {total} registro(s)
          </span>
        </div>
        {documents.length === 0 ? (
          <EmptyState
            description="Nenhum documento corresponde aos filtros informados."
            title="Base vazia"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="text-xs tracking-wide text-[var(--color-muted)] uppercase">
                  {[
                    'Título',
                    'Categoria',
                    'Visibilidade',
                    'Status',
                    'Trechos',
                    'Versão',
                    canArchive ? 'Ações' : '',
                  ]
                    .filter(Boolean)
                    .map((heading) => (
                      <th className="border-b p-3" key={heading}>
                        {heading}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => (
                  <tr key={document.id}>
                    <td className="border-b p-3">
                      <Link
                        className="font-medium text-[var(--color-primary)] hover:underline"
                        href={`/dashboard/base-conhecimento/${document.id}`}
                      >
                        {document.title}
                      </Link>
                      <p className="text-xs text-[var(--color-muted)]">
                        {document.ownerName ?? 'Sem responsável'}
                        {document.teamName ? ` · ${document.teamName}` : ''}
                      </p>
                    </td>
                    <td className="border-b p-3">
                      {categoryLabels[document.category]}
                    </td>
                    <td className="border-b p-3">
                      {visibilityLabels[document.visibility]}
                    </td>
                    <td className="border-b p-3">
                      <Badge tone={statusTones[document.status]}>
                        {document.status}
                      </Badge>
                    </td>
                    <td className="border-b p-3">{document.chunkCount}</td>
                    <td className="border-b p-3">{document.version}</td>
                    {canArchive ? (
                      <td className="border-b p-3">
                        {document.status !== 'ARCHIVED' ? (
                          <Button
                            disabled={busy}
                            onClick={() => void archive(document.id)}
                            variant="outline"
                          >
                            <Archive className="h-4 w-4" />
                            Arquivar
                          </Button>
                        ) : (
                          <span className="text-xs text-[var(--color-muted)]">
                            Arquivado
                          </span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} params={paginationParams} totalPages={totalPages} />
      </Card>
    </div>
  );
}
