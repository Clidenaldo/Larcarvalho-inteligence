'use client';

import {
  MATRIZ_DESTINO,
  arquivoTipos,
  importExecutionPlanSchema,
  importacaoFields,
  importacaoIssueListResponseSchema,
  importacaoPreviewSchema,
  importacaoRequiredFields,
  importacaoSchema,
  importacaoTipos,
  importacaoValidationSchema,
  type ArquivoTipo,
  type AuthResponse,
  type Importacao,
  type ImportacaoTipo,
  type ImportacaoValidation,
  type ImportacaoIssue,
  type ImportExecutionPlan,
} from '@larcarvalho/shared';
import Link from 'next/link';
import { useState } from 'react';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Field, Input, Select } from './ui/field';

const labels: Record<ImportacaoTipo, string> = {
  ADMINISTRADORAS: 'Administradoras',
  PRODUTOS: 'Produtos',
  GRUPOS: 'Grupos',
  COTAS: 'Cotas',
  ASSEMBLEIAS: 'Assembleias',
  LANCES: 'Lances',
  CONTEMPLACOES: 'Contemplações',
  TABELAS_COMERCIAIS: 'Tabelas comerciais',
};
const classificacaoLabels: Record<ArquivoTipo, string> = {
  COMMERCIAL_TABLE: 'Tabela comercial',
  GROUP_PORTFOLIO: 'Carteira de grupos',
  QUOTA_PORTFOLIO: 'Carteira de cotas',
  ASSEMBLY_HISTORY: 'Histórico de assembleias',
  MIXED: 'Arquivo misto',
};
const classificacaoHints: Record<ArquivoTipo, string> = {
  COMMERCIAL_TABLE: 'Planos, créditos, parcelas, taxas e regras. Nunca cria grupos, cotas ou assembleias.',
  GROUP_PORTFOLIO: 'Cadastro operacional de grupos. Não cria tabelas comerciais.',
  QUOTA_PORTFOLIO: 'Cadastro operacional de cotas. Não cria contemplações.',
  ASSEMBLY_HISTORY: 'Assembleias e fatos históricos. Lances e contemplações só com dados explícitos.',
  MIXED: 'Múltiplas seções: execute uma importação por entidade.',
};
const fieldLabel = (value: string) =>
  value
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (letter) => letter.toUpperCase());
async function message(response: Response) {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? 'Não foi possível concluir a operação';
  } catch {
    return 'Não foi possível concluir a operação';
  }
}

export function ImportacoesWizard({
  identity,
}: {
  readonly identity: AuthResponse;
}) {
  const [step, setStep] = useState(1);
  const [tipo, setTipo] = useState<ImportacaoTipo>('ADMINISTRADORAS');
  const [classificacao, setClassificacao] = useState<ArquivoTipo | ''>('');
  const [current, setCurrent] = useState<Importacao | null>(null);
  const [preview, setPreview] = useState<
    ReadonlyArray<Record<string, unknown>>
  >([]);
  const [needsReview, setNeedsReview] = useState<readonly string[]>([]);
  // Destinos válidos recalculados a cada mudança de classificação (2.5).
  const allowedTipos = classificacao
    ? MATRIZ_DESTINO[classificacao]
    : importacaoTipos;
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<ImportacaoValidation | null>(null);
  const [issues, setIssues] = useState<readonly ImportacaoIssue[]>([]);
  const [plan, setPlan] = useState<ImportExecutionPlan | null>(null);
  const [strategy, setStrategy] = useState<'IGNORAR' | 'ATUALIZAR'>('IGNORAR');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canCreate = identity.permissions.includes('importacoes.create');
  const canExecute = identity.permissions.includes('importacoes.execute');
  async function loadPreview(id: string, sheet?: string) {
    const response = await fetch(
      `/api/importacoes/${id}/preview${sheet ? `?aba=${encodeURIComponent(sheet)}` : ''}`,
    );
    if (!response.ok) throw new Error(await message(response));
    const data = importacaoPreviewSchema.parse(await response.json());
    setCurrent(data.importacao);
    setPreview(data.preview);
    setMapping(data.importacao.mapeamento ?? {});
    setNeedsReview(data.needsReview);
    setIssues([]);
  }
  async function upload(form: HTMLFormElement) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/importacoes/upload', {
        method: 'POST',
        body: new FormData(form),
      });
      if (!response.ok) throw new Error(await message(response));
      const item = importacaoSchema.parse(await response.json());
      await loadPreview(item.id);
      setStep(item.abas.length > 1 ? 2 : 3);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha no upload');
    } finally {
      setBusy(false);
    }
  }
  async function chooseSheet(sheet: string) {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      await loadPreview(current.id, sheet);
      setStep(3);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao abrir aba');
    } finally {
      setBusy(false);
    }
  }
  async function saveMapping() {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const clean = Object.fromEntries(
        Object.entries(mapping).filter(([, column]) => column),
      );
      const response = await fetch(`/api/importacoes/${current.id}/mapping`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          aba: current.abaSelecionada ?? undefined,
          mapeamento: clean,
        }),
      });
      if (!response.ok) throw new Error(await message(response));
      setCurrent(importacaoSchema.parse(await response.json()));
      setStep(4);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha no mapeamento');
    } finally {
      setBusy(false);
    }
  }
  async function validate() {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/importacoes/${current.id}/validate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ estrategia: strategy }),
      });
      if (!response.ok) throw new Error(await message(response));
      const validated = importacaoValidationSchema.parse(await response.json());
      setSummary(validated);
      const issuesResponse = await fetch(
        `/api/importacoes/${current.id}/issues?page=1&pageSize=100`,
      );
      if (!issuesResponse.ok) throw new Error(await message(issuesResponse));
      setIssues(
        importacaoIssueListResponseSchema.parse(await issuesResponse.json())
          .items,
      );
      const planResponse = await fetch(`/api/importacoes/${current.id}/plan`);
      if (planResponse.ok)
        setPlan(importExecutionPlanSchema.parse(await planResponse.json()));
      setStep(5);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha na validação');
    } finally {
      setBusy(false);
    }
  }
  async function execute() {
    if (!current) return;
    setBusy(true);
    setError(null);
    setStep(6);
    try {
      const response = await fetch(`/api/importacoes/${current.id}/execute`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error(await message(response));
      setCurrent(importacaoSchema.parse(await response.json()));
      setStep(7);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Falha no processamento',
      );
      setStep(5);
    } finally {
      setBusy(false);
    }
  }
  if (!canCreate) return null;
  return (
    <Card className="p-5">
      <div
        className="mb-5 flex flex-wrap gap-2"
        aria-label="Etapas da importação"
      >
        {[
          'Arquivo',
          'Aba',
          'Mapeamento',
          'Validação',
          'Revisão',
          'Processamento',
          'Resultado',
        ].map((label, index) => (
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${step === index + 1 ? 'bg-[var(--color-primary)] text-white' : step > index + 1 ? 'bg-indigo-50 text-indigo-800' : 'bg-slate-100 text-slate-500'}`}
            key={label}
          >
            {index + 1}. {label}
          </span>
        ))}
      </div>
      {error ? (
        <div className="mb-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}
      {step === 1 ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void upload(event.currentTarget);
          }}
          className="grid gap-4 md:grid-cols-3 md:items-end"
        >
          <Field
            helpKey="import.type"
            label="Que tipo de arquivo é este?"
            help="A classificação limita os destinos válidos"
            required
          >
            <Select
              name="classificacaoArquivo"
              value={classificacao}
              onChange={(event) => {
                const next = event.target.value as ArquivoTipo | '';
                setClassificacao(next);
                if (next) {
                  const allowed = MATRIZ_DESTINO[next];
                  if (!allowed.includes(tipo)) setTipo(allowed[0] ?? 'ADMINISTRADORAS');
                }
              }}
            >
              <option value="">Não classificado</option>
              {arquivoTipos.map((item) => (
                <option key={item} value={item}>
                  {classificacaoLabels[item]}
                </option>
              ))}
            </Select>
          </Field>
          <Field helpKey="import.type" label="Tipo de dado" required>
            <Select
              name="tipoImportacao"
              value={tipo}
              onChange={(event) =>
                setTipo(event.target.value as ImportacaoTipo)
              }
            >
              {allowedTipos.map((item) => (
                <option key={item} value={item}>
                  {labels[item]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            helpKey="import.file"
            label="Arquivo CSV, XLSX ou XLS"
            help="Máximo de 20 MB"
            required
          >
            <Input
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              name="arquivo"
              required
              type="file"
            />
          </Field>
          <Button loading={busy} type="submit">
            Enviar e visualizar
          </Button>
        </form>
      ) : null}
      {step === 1 && classificacao ? (
        <p className="mt-3 text-sm text-[var(--color-muted)]">
          {classificacaoHints[classificacao]} Destinos válidos:{' '}
          {MATRIZ_DESTINO[classificacao].map((item) => labels[item]).join(', ')}.
        </p>
      ) : null}
      {step === 2 && current ? (
        <div className="max-w-md space-y-4">
          <Field helpKey="import.sheet" label="Aba da planilha" required>
            <Select
              defaultValue={current.abaSelecionada ?? ''}
              id="sheet-select"
            >
              {current.abas.map((sheet) => (
                <option key={sheet}>{sheet}</option>
              ))}
            </Select>
          </Field>
          <Button
            loading={busy}
            onClick={() => {
              const element =
                document.querySelector<HTMLSelectElement>('#sheet-select');
              if (element) void chooseSheet(element.value);
            }}
          >
            Usar esta aba
          </Button>
        </div>
      ) : null}
      {step === 3 && current ? (
        <div className="space-y-5">
          <div>
            <h3 className="font-semibold">Mapeie as colunas</h3>
            <p className="text-sm text-[var(--color-muted)]">
              Estes dados alimentarão: <strong>{labels[current.tipo]}</strong>.
              As sugestões precisam ser revisadas. Uma coluna só pode alimentar
              um campo.
            </p>
            {needsReview.length > 0 ? (
              <Alert tone="danger">
                Colunas que exigem revisão explícita (nome genérico, sem
                mapeamento automático): {needsReview.join(', ')}.
              </Alert>
            ) : null}
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {importacaoFields[current.tipo].map((field) => (
              <Field
                helpKey="import.mapping"
                key={field}
                label={fieldLabel(field)}
                required={(
                  importacaoRequiredFields[current.tipo] as readonly string[]
                ).includes(field)}
              >
                <Select
                  value={mapping[field] ?? ''}
                  onChange={(event) =>
                    setMapping((before) => ({
                      ...before,
                      [field]: event.target.value,
                    }))
                  }
                >
                  <option value="">Não importar</option>
                  {current.colunas.map((column) => (
                    <option
                      disabled={Object.entries(mapping).some(
                        ([mappedField, mappedColumn]) =>
                          mappedField !== field && mappedColumn === column,
                      )}
                      key={column}
                      value={column}
                    >
                      {column}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
          <Button loading={busy} onClick={() => void saveMapping()}>
            Salvar mapeamento
          </Button>
        </div>
      ) : null}
      {step === 4 ? (
        <div className="max-w-md space-y-4">
          <Field helpKey="import.duplicates" label="Duplicidades no banco">
            <Select
              value={strategy}
              onChange={(event) =>
                setStrategy(event.target.value as 'IGNORAR' | 'ATUALIZAR')
              }
            >
              <option value="IGNORAR">Ignorar existentes</option>
              <option value="ATUALIZAR">Atualizar com chave confiável</option>
            </Select>
          </Field>
          <Button loading={busy} onClick={() => void validate()}>
            Validar todas as linhas
          </Button>
        </div>
      ) : null}
      {step === 5 && summary ? (
        <div className="space-y-5">
          {plan?.entities.map((entity) => (
            <div className="space-y-3" key={entity.entity}>
              <h3 className="font-semibold">
                {labels[entity.entity]} — {entity.rows} linhas
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-xs uppercase text-slate-500">Criar</p>
                  <p className="mt-1 text-2xl font-semibold text-emerald-600">
                    {entity.creates}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-xs uppercase text-slate-500">Atualizar</p>
                  <p className="mt-1 text-2xl font-semibold text-blue-600">
                    {entity.updates}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-xs uppercase text-slate-500">Sem alteração</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-400">
                    {entity.unchanged}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-xs uppercase text-slate-500">Conflito</p>
                  <p className="mt-1 text-2xl font-semibold text-amber-600">
                    {entity.conflicts}
                  </p>
                </div>
              </div>
              {entity.sample.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2">Linha</th>
                        <th className="px-3 py-2">Estado</th>
                        <th className="px-3 py-2">Campo</th>
                        <th className="px-3 py-2">De → Para</th>
                        <th className="px-3 py-2">Política</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entity.sample.map((row) =>
                        row.diffs.length > 0
                          ? row.diffs.map((diff) => (
                              <tr className="border-t" key={`${row.row}-${diff.field}`}>
                                <td className="px-3 py-2">{row.row}</td>
                                <td className="px-3 py-2 font-mono">{row.state}</td>
                                <td className="px-3 py-2">{diff.field}</td>
                                <td className="px-3 py-2">
                                  {diff.from ?? '—'} → {diff.to ?? '—'}
                                </td>
                                <td className="px-3 py-2">{diff.policy}</td>
                              </tr>
                            ))
                          : (
                              <tr className="border-t" key={`${row.row}-no-diff`}>
                                <td className="px-3 py-2">{row.row}</td>
                                <td className="px-3 py-2 font-mono">{row.state}</td>
                                <td className="px-3 py-2" colSpan={3}>
                                  {row.state === 'CREATE' ? 'Novo registro' : row.state === 'UNCHANGED' ? 'Já existe — sem alteração' : '—'}
                                </td>
                              </tr>
                            ),
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ))}
          {!plan ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(summary).map(([key, value]) => (
                <div className="rounded-lg bg-slate-50 p-4" key={key}>
                  <p className="text-xs uppercase text-slate-500">
                    {fieldLabel(key)}
                  </p>
                  <p className="mt-1 text-2xl font-semibold">{value}</p>
                </div>
              ))}
            </div>
          ) : null}
          {summary.erros ? (
            <Alert tone="info">
              Linhas com erro não serão gravadas. Consulte o detalhe para ver os
              problemas.
            </Alert>
          ) : null}
          {issues.length ? (
            <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    {[
                      'Linha',
                      'Campo',
                      'Código',
                      'Mensagem',
                      'Valor recebido',
                    ].map((label) => (
                      <th className="px-3 py-2" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {issues.map((issue) => (
                    <tr className="border-t" key={issue.id}>
                      <td className="px-3 py-2">{issue.linha ?? '—'}</td>
                      <td className="px-3 py-2">{issue.campo ?? '—'}</td>
                      <td className="px-3 py-2 font-mono">{issue.codigo}</td>
                      <td className="px-3 py-2">{issue.mensagem}</td>
                      <td className="max-w-64 truncate px-3 py-2">
                        {issue.valorRecebido ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {current ? (
            <Link
              className="inline-block text-sm font-semibold text-[var(--color-primary)] hover:underline"
              href={`/dashboard/importacoes/${current.id}`}
            >
              Abrir relatório completo antes de executar
            </Link>
          ) : null}
          <Button
            disabled={!canExecute || summary.validas === 0}
            loading={busy}
            onClick={() => void execute()}
          >
            Confirmar e processar
          </Button>
        </div>
      ) : null}
      {step === 6 ? (
        <Alert tone="info">
          Processando em lotes seguros. Não feche esta etapa.
        </Alert>
      ) : null}
      {step === 7 && current ? (
        <div className="space-y-4">
          <Alert tone={current.status === 'CONCLUIDA' ? 'success' : 'info'}>
            Importação finalizada: {current.registrosCriados} criados,{' '}
            {current.registrosAtualizados} atualizados e{' '}
            {current.registrosInvalidos} inválidos.
          </Alert>
          <Link
            className="text-sm font-semibold text-[var(--color-primary)] hover:underline"
            href={`/dashboard/importacoes/${current.id}`}
          >
            Abrir relatório completo
          </Link>
        </div>
      ) : null}
      {current && step >= 2 && step <= 5 ? (
        <div className="mt-6 overflow-x-auto">
          <p className="mb-2 text-sm font-semibold">
            Preview — {current.nomeArquivo} · {current.abaSelecionada}
          </p>
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr>
                {current.colunas.map((column) => (
                  <th className="border-b p-2" key={column}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, index) => (
                <tr key={index}>
                  {current.colunas.map((column) => (
                    <td className="max-w-56 truncate border-b p-2" key={column}>
                      {String(row[column] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}
