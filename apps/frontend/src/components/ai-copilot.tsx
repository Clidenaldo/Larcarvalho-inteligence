'use client';

import type {
  AiActionDraft,
  AiContextType,
  AiPromptId,
  AiSource,
  AiStructuredResponse,
  Permission,
} from '@larcarvalho/shared';
import { aiChatResponseSchema, aiStatusResponseSchema, aiStreamEventSchema } from '@larcarvalho/shared';
import { Copy, RotateCcw, Send, Sparkles, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '../lib/styles';
import { Alert } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';

export interface AiOpenDetail {
  readonly contextId?: string;
  readonly contextType?: AiContextType;
  readonly message: string;
  readonly promptId?: AiPromptId;
  readonly resultIds?: readonly string[];
}

interface Shortcut {
  readonly label: string;
  readonly message: string;
  readonly promptId: AiPromptId;
}

const SHORTCUTS: Readonly<Record<AiContextType, readonly Shortcut[]>> = {
  COMMERCIAL_MANAGEMENT: [
    { label: 'Resumir gestao', message: 'Resuma minha gestao comercial', promptId: 'manager-summary' },
    { label: 'O que esta atrasado?', message: 'O que esta atrasado?', promptId: 'manager-summary' },
    { label: 'Gargalos factuais', message: 'Quais gargalos factuais existem no periodo?', promptId: 'manager-summary' },
    { label: 'Comparar periodo', message: 'Compare este periodo com o anterior', promptId: 'manager-summary' },
  ],
  COMPARATOR: [
    { label: 'Analisar comparação', message: 'Analisar comparação', promptId: 'comparison-analysis' },
    { label: 'Mostrar diferenças', message: 'Quais são as principais diferenças entre as alternativas?', promptId: 'comparison-analysis' },
    { label: 'Pontos fortes e limitações', message: 'Quais os pontos fortes e limitações de cada alternativa?', promptId: 'comparison-analysis' },
  ],
  DASHBOARD: [
    { label: 'Meu dia', message: 'O que tenho para hoje?', promptId: 'my-day' },
    { label: 'Resumir meu funil', message: 'Resuma meu funil de vendas', promptId: 'manager-summary' },
    { label: 'Resumir minha carteira', message: 'Resuma minha carteira', promptId: 'manager-summary' },
    { label: 'Quem devo atender agora?', message: 'Quem devo atender agora?', promptId: 'manager-summary' },
    { label: 'Leads sem retorno', message: 'Quais leads precisam de retorno?', promptId: 'lead-analysis' },
  ],
  GENERAL: [
    { label: 'Meu dia', message: 'O que tenho para hoje?', promptId: 'my-day' },
    { label: 'Resumir meus leads', message: 'Resuma meus leads', promptId: 'lead-analysis' },
    { label: 'Resumir minha carteira', message: 'Resuma minha carteira', promptId: 'manager-summary' },
    { label: 'Quem devo atender agora?', message: 'Quem devo atender agora?', promptId: 'lead-analysis' },
  ],
  KNOWLEDGE: [
    { label: 'Consultar a base', message: 'O que a base de conhecimento diz sobre contemplação?', promptId: 'knowledge-grounded-answer' },
    { label: 'Prazos e condições', message: 'Quais prazos e condições estão documentados?', promptId: 'knowledge-grounded-answer' },
    { label: 'Procedimentos internos', message: 'Quais procedimentos internos estão documentados?', promptId: 'knowledge-grounded-answer' },
  ],
  LEAD: [
    { label: 'Resumir cliente', message: 'Resuma este cliente', promptId: 'customer-360' },
    { label: 'Preparar atendimento', message: 'Prepare o atendimento deste cliente', promptId: 'customer-360' },
    { label: 'Analisar cliente', message: 'Analise este cliente', promptId: 'lead-analysis' },
    { label: 'O que falta perguntar?', message: 'Quais informações faltam neste cliente?', promptId: 'lead-analysis' },
    { label: 'Preparar follow-up', message: 'Prepare uma mensagem de follow-up', promptId: 'follow-up-draft' },
    { label: 'Preparar ligação', message: 'Prepare um roteiro de ligação para este cliente', promptId: 'lead-analysis' },
    { label: 'Próxima ação', message: 'Qual é a próxima ação sugerida para este cliente?', promptId: 'customer-360' },
  ],
  PROPOSAL: [
    { label: 'Resumir proposta', message: 'Resuma esta proposta', promptId: 'commercial-copilot' },
    { label: 'Explicar alternativas', message: 'Explique as alternativas desta proposta', promptId: 'comparison-analysis' },
    { label: 'Preparar apresentação', message: 'Prepare um resumo para apresentar esta proposta', promptId: 'commercial-copilot' },
    { label: 'Criar mensagem de envio', message: 'Crie uma mensagem de envio desta proposta', promptId: 'follow-up-draft' },
    { label: 'Preparar follow-up', message: 'Prepare uma mensagem de follow-up desta proposta', promptId: 'follow-up-draft' },
  ],
  SALE: [
    { label: 'Resumir venda', message: 'Resuma esta venda', promptId: 'sale-summary' },
    { label: 'O que falta para contratação?', message: 'O que falta para a contratação desta venda?', promptId: 'sale-summary' },
    { label: 'Solicitar documentos', message: 'Prepare uma mensagem solicitando os documentos pendentes', promptId: 'sale-summary' },
    { label: 'Explicar divergência', message: 'Explique a divergência da comissão desta venda', promptId: 'sale-summary' },
    { label: 'Vendas aguardando análise', message: 'Quais vendas estão aguardando análise?', promptId: 'sale-summary' },
  ],
  SIMULATION: [
    { label: 'Explicar simulação', message: 'Explique esta simulação', promptId: 'simulation-explanation' },
    { label: 'Pontos de atenção', message: 'Quais são os pontos de atenção desta simulação?', promptId: 'simulation-explanation' },
    { label: 'Explicar aderência', message: 'Explique a aderência desta simulação', promptId: 'simulation-explanation' },
  ],
};

interface AssistantTurn {
  readonly draft: string | null;
  readonly kind: 'assistant';
  readonly response: AiStructuredResponse;
  readonly streamId: string | null;
  readonly suggestedAction: AiActionDraft | null;
}

function ApplySuggestion({ action }: { readonly action: AiActionDraft }) {
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'danger' | 'success' } | null>(null);
  if (action.type !== 'CREATE_FOLLOWUP' || !action.leadId) return null;
  const leadId: string = action.leadId;
  return (
    <div className="mt-3 rounded-lg border border-[var(--color-border)] p-3">
      <p className="text-xs font-semibold tracking-wide uppercase">Sugestão da IA</p>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Criar follow-up. Nada é executado sem a sua confirmação.
      </p>
      {!expanded ? (
        <Button className="mt-2" onClick={() => setExpanded(true)} type="button" variant="outline">
          Aplicar sugestão
        </Button>
      ) : (
        <form
          className="mt-2 grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setPending(true);
            setMessage(null);
            fetch('/api/followups', {
              body: JSON.stringify({
                dueAt: new Date(String(data.get('dueAt'))).toISOString(),
                leadId,
                notes: data.get('notes') || undefined,
                title: data.get('title'),
                type: data.get('type'),
              }),
              headers: { 'content-type': 'application/json' },
              method: 'POST',
            })
              .then(async (response) => {
                if (!response.ok) {
                  const payload = (await response.json()) as { error?: { message?: string } };
                  throw new Error(payload.error?.message ?? 'Operação não concluída');
                }
                // Mantém o painel aberto para exibir a confirmação.
                setMessage({ text: 'Follow-up criado a partir da sugestão.', tone: 'success' });
              })
              .catch((problem: unknown) => {
                setMessage({
                  text: problem instanceof Error ? problem.message : 'Falha inesperada',
                  tone: 'danger',
                });
              })
              .finally(() => setPending(false));
          }}
        >
          {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
          <label className="grid gap-1 text-sm">
            Título
            <input
              className="min-h-10 rounded-lg border border-[var(--color-border)] px-3 text-sm"
              defaultValue={action.title ?? ''}
              maxLength={200}
              name="title"
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            Tipo
            <select
              className="min-h-10 rounded-lg border border-[var(--color-border)] px-3 text-sm"
              defaultValue="CALL"
              name="type"
            >
              <option value="CALL">Ligação</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="EMAIL">E-mail</option>
              <option value="MEETING">Reunião</option>
              <option value="OTHER">Outro</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Vencimento
            <input
              className="min-h-10 rounded-lg border border-[var(--color-border)] px-3 text-sm"
              defaultValue={action.dueAt ? action.dueAt.slice(0, 16) : ''}
              name="dueAt"
              required
              type="datetime-local"
            />
          </label>
          <label className="grid gap-1 text-sm">
            Observações
            <input
              className="min-h-10 rounded-lg border border-[var(--color-border)] px-3 text-sm"
              defaultValue={action.notes ?? ''}
              maxLength={2000}
              name="notes"
            />
          </label>
          <div className="flex gap-2">
            <Button disabled={pending} type="submit">
              Criar follow-up
            </Button>
            <Button onClick={() => setExpanded(false)} type="button" variant="outline">
              Descartar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

interface UserTurn {
  readonly kind: 'user';
  readonly text: string;
}

type Turn = AssistantTurn | UserTurn;

type ErrorKind =
  | 'context'
  | 'network'
  | 'permission'
  | 'rate-limit'
  | 'service'
  | 'timeout'
  | null;

const ERROR_MESSAGES: Readonly<Record<Exclude<ErrorKind, null>, string>> = {
  context: 'Contexto não disponível. Verifique se o registro pertence ao seu escopo de acesso.',
  network: 'Serviço indisponível. Tente novamente.',
  permission: 'Você não tem permissão para usar este recurso da IA.',
  'rate-limit': 'Muitas tentativas. Aguarde um momento e tente novamente.',
  service: 'A IA está indisponível no momento. Tente novamente mais tarde.',
  timeout: 'Tempo esgotado. Tente novamente com uma pergunta mais curta.',
};

function Section({ title, items }: { readonly items: readonly string[]; readonly title: string }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <h4 className="text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
        {title}
      </h4>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function emptyResponse(): AiStructuredResponse {
  return {
    attentionPoints: [],
    draft: null,
    facts: [],
    missingInformation: [],
    sources: [],
    suggestedActions: [],
    summary: '',
  };
}

function formatUsage(usage: NonNullable<AiStructuredResponse['usage']>): string {
  const parts = [
    `tokens ${usage.totalTokens ?? '?'} (in ${usage.inputTokens ?? '?'} / out ${usage.outputTokens ?? '?'})${usage.estimated ? ', estimado' : ''}`,
  ];
  if (usage.costMicros !== null && usage.costMicros !== undefined) {
    const units = usage.costMicros / 1_000_000;
    parts.push(`custo ${units.toFixed(6)} ${usage.currency ?? ''}`.trim());
  } else {
    parts.push('custo não configurado');
  }
  return parts.join(' · ');
}

export function AiCopilot({
  contextId,
  contextLabel,
  contextType,
  permissions,
  resultIds,
}: {
  readonly contextId?: string;
  readonly contextLabel: string;
  readonly contextType: AiContextType;
  readonly permissions: readonly Permission[];
  readonly resultIds?: readonly string[];
}) {
  const canUse = permissions.includes('ai.use');
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [state, setState] = useState<'error' | 'idle' | 'loading' | 'success'>('idle');
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Readonly<Record<number, 'down' | 'up'>>>({});
  const abortRef = useRef<AbortController | null>(null);
  const streamIdRef = useRef<string | null>(null);
  const sendingRef = useRef(false);
  const contextKey = `${contextType}:${contextId ?? ''}`;
  const canSeeUsage = permissions.includes('ai.usage');

  useEffect(() => {
    abortRef.current?.abort();
    sendingRef.current = false;
    streamIdRef.current = null;
    setTurns([]);
    setState('idle');
    setErrorKind(null);
    setServerMessage(null);
  }, [contextKey]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch('/api/ai/status', { headers: { accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok || cancelled) return;
        const status = aiStatusResponseSchema.parse(await response.json());
        if (!status.ready) setStatusNotice(status.message);
      })
      .catch(() => {
        if (!cancelled) setStatusNotice(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open ]);

  const send = useCallback(
    async (options: {
      readonly contextId?: string;
      readonly contextType?: AiContextType;
      readonly message: string;
      readonly promptId: AiPromptId;
      readonly resultIds?: readonly string[];
    }) => {
      const trimmed = options.message.trim();
      if (trimmed === '' || state === 'loading' || sendingRef.current) return;
      const effectiveType = options.contextType ?? contextType;
      const effectiveId = options.contextId ?? contextId;
      const effectiveResults = options.resultIds ?? resultIds;
      const payload = {
        ...(effectiveId ? { contextId: effectiveId } : {}),
        contextType: effectiveType,
        message: trimmed,
        promptId: options.promptId,
        ...(effectiveResults && effectiveResults.length > 0
          ? { resultIds: [...effectiveResults] }
          : {}),
      };
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      sendingRef.current = true;
      streamIdRef.current = null;
      setTurns((current) => [...current, { kind: 'user', text: trimmed }]);
      setInput('');
      setState('loading');
      setErrorKind(null);
      setServerMessage(null);

      const fail = async (response: Response): Promise<boolean> => {
        sendingRef.current = false;
        let message: string | null = null;
        try {
          const body = (await response.json()) as {
            error?: { code?: string; message?: string };
          };
          if (body.error?.message) message = body.error.message;
        } catch {
          message = null;
        }
        if (response.status === 401) setErrorKind('permission');
        else if (response.status === 403) setErrorKind('permission');
        else if (response.status === 404) setErrorKind('context');
        else if (response.status === 429) {
          setErrorKind('rate-limit');
          if (message) setServerMessage(message);
        } else if (response.status === 504) setErrorKind('timeout');
        else {
          setErrorKind('service');
          if (message) setServerMessage(message);
        }
        setState('error');
        return true;
      };

      const sendBuffered = async (): Promise<void> => {
        try {
          const response = await fetch('/api/ai/chat', {
            body: JSON.stringify(payload),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]),
          });
          if (!response.ok) {
            await fail(response);
            return;
          }
          const parsed = aiChatResponseSchema.parse(await response.json());
          sendingRef.current = false;
          setTurns((current) => [
            ...current,
            {
              draft: parsed.response.draft,
              kind: 'assistant',
              response: parsed.response,
              streamId: null,
              suggestedAction: parsed.response.suggestedAction ?? null,
            },
          ]);
          setState('success');
        } catch (error) {
          sendingRef.current = false;
          if (error instanceof DOMException && error.name === 'AbortError') {
            setState('idle');
            return;
          }
          if (error instanceof DOMException && error.name === 'TimeoutError') {
            setErrorKind('timeout');
          } else {
            setErrorKind('network');
          }
          setState('error');
        }
      };

      const ensurePlaceholder = () => {
        // Race-free: the id is generated synchronously; updaters stay pure
        // (React may defer or double-invoke updaters in dev/StrictMode, so
        // reading state inside an updater to derive an index is unsafe).
        if (streamIdRef.current !== null) return streamIdRef.current;
        const id =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `stream-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
        streamIdRef.current = id;
        setTurns((current) => [
          ...current,
          {
            draft: null,
            kind: 'assistant',
            response: emptyResponse(),
            streamId: id,
            suggestedAction: null,
          },
        ]);
        return id;
      };

      const patchPlaceholder = (
        mutate: (response: AiStructuredResponse) => AiStructuredResponse,
      ) => {
        const id = ensurePlaceholder();
        setTurns((current) =>
          current.map((turn) =>
            turn.kind === 'assistant' && turn.streamId === id
              ? { ...turn, response: mutate(turn.response) }
              : turn,
          ),
        );
      };

      const dropPlaceholder = () => {
        const id = streamIdRef.current;
        streamIdRef.current = null;
        if (id === null) return;
        setTurns((current) =>
          current.filter(
            (turn) => !(turn.kind === 'assistant' && turn.streamId === id),
          ),
        );
      };

      // Streaming first (progressive SSE); buffered fallback on transport issues.
      try {
        const response = await fetch('/api/ai/chat/stream', {
          body: JSON.stringify(payload),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
          signal: controller.signal,
        });
        if (!response.ok) {
          await fail(response);
          return;
        }
        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.includes('text/event-stream') || !response.body) {
          await sendBuffered();
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let sawEvent = false;
        const pump = async (): Promise<boolean> => {
          const { done, value } = await reader.read();
          if (done) return true;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() ?? '';
          for (const block of blocks) {
            for (const line of block.split('\n')) {
              const trimmedLine = line.trim();
              if (!trimmedLine.startsWith('data:')) continue;
              const parsed = aiStreamEventSchema.safeParse(
                JSON.parse(trimmedLine.slice(5).trim()) as unknown,
              );
              if (!parsed.success) {
                if (!sawEvent) return false;
                sendingRef.current = false;
                setErrorKind('service');
                setState('error');
                return true;
              }
              sawEvent = true;
              const event = parsed.data;
              if (event.type === 'delta') {
                const text = event.text;
                patchPlaceholder((response) => ({
                  ...response,
                  summary: `${response.summary}${text}`,
                }));
              } else if (event.type === 'fact') {
                const text = event.text;
                patchPlaceholder((response) => ({
                  ...response,
                  facts: [...response.facts, text],
                }));
              } else if (event.type === 'source') {
                const source: AiSource = event.source;
                patchPlaceholder((response) => ({
                  ...response,
                  sources: [...response.sources, source],
                }));
              } else if (event.type === 'usage') {
                const usage = event.usage;
                patchPlaceholder((response) => ({ ...response, usage }));
              } else if (event.type === 'done') {
                patchPlaceholder((response) => ({
                  ...response,
                  ...(event.grounded === undefined ? {} : { grounded: event.grounded }),
                  ...(event.warnings === undefined ? {} : { warnings: event.warnings }),
                }));
                streamIdRef.current = null;
                sendingRef.current = false;
                setState('success');
                return true;
              } else if (event.type === 'error') {
                sendingRef.current = false;
                if (event.code === 'USAGE_LIMIT_EXCEEDED') {
                  setErrorKind('rate-limit');
                  setServerMessage(event.message);
                } else {
                  setErrorKind('service');
                  setServerMessage(event.message);
                }
                dropPlaceholder();
                setState('error');
                return true;
              }
            }
          }
          return pump();
        };
        const completed = await pump();
        if (!completed) {
          dropPlaceholder();
          await sendBuffered();
        }
      } catch (error) {
        sendingRef.current = false;
        if (error instanceof DOMException && error.name === 'AbortError') {
          dropPlaceholder();
          setState('idle');
          return;
        }
        dropPlaceholder();
        await sendBuffered();
      }
    },
    [contextId, contextType, resultIds, state],
  );

  useEffect(() => {
    const openFromModule = (event: Event) => {
      const detail = (event as CustomEvent<AiOpenDetail>).detail;
      if (!detail) return;
      setOpen(true);
      void send({
        ...(detail.contextId ? { contextId: detail.contextId } : {}),
        ...(detail.contextType ? { contextType: detail.contextType } : {}),
        message: detail.message,
        promptId: detail.promptId ?? 'commercial-copilot',
        ...(detail.resultIds ? { resultIds: detail.resultIds } : {}),
      });
    };
    window.addEventListener('larcarvalho:ai-open', openFromModule);
    return () => {
      window.removeEventListener('larcarvalho:ai-open', openFromModule);
    };
  }, [send]);

  if (!canUse) return null;

  const shortcuts = SHORTCUTS[contextType] ?? SHORTCUTS.GENERAL;

  return (
    <>
      <button
        aria-label="Abrir Larcarvalho AI"
        className="fixed right-4 bottom-4 z-40 inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-[var(--color-primary-hover)] sm:right-6 sm:bottom-6"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Sparkles aria-hidden="true" className="h-4 w-4" />
        Larcarvalho AI
      </button>
      {open ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Larcarvalho AI — Copiloto Comercial">
          <button
            aria-label="Fechar Larcarvalho AI"
            className="absolute inset-0 bg-slate-950/40"
            onClick={() => {
              abortRef.current?.abort();
              setOpen(false);
            }}
            type="button"
          />
          <aside className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-xl sm:max-w-md">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">Larcarvalho AI</h2>
                <p className="text-sm text-[var(--color-muted)]">Copiloto Comercial</p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  Contexto atual: {contextLabel}
                </p>
              </div>
              <button
                aria-label="Fechar painel"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                onClick={() => {
                  abortRef.current?.abort();
                  setOpen(false);
                }}
                type="button"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
            {statusNotice ? (
              <p className="border-b border-[var(--color-border)] bg-slate-50 px-5 py-2 text-xs text-[var(--color-muted)]">
                {statusNotice}
              </p>
            ) : null}
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4" aria-live="polite">
              {turns.length === 0 && state !== 'loading' ? (
                <Card className="p-4">
                  <p className="text-sm text-[var(--color-muted)]">
                    Como posso ajudar? Escolha um atalho ou escreva sua pergunta.
                  </p>
                </Card>
              ) : null}
              {turns.map((turn, index) =>
                turn.kind === 'user' ? (
                  <p
                    key={`turn-${index}`}
                    className="ml-8 rounded-xl bg-[var(--color-primary-soft)] px-4 py-2 text-sm"
                  >
                    {turn.text}
                  </p>
                ) : (
                  <Card key={`turn-${index}`} className="space-y-2 p-4">
                    <p className="text-sm">{turn.response.summary}</p>
                    <Section title="Fatos" items={turn.response.facts} />
                    <Section title="Dados ausentes" items={turn.response.missingInformation} />
                    <Section title="Pontos de atenção" items={turn.response.attentionPoints} />
                    <Section title="Próximas ações" items={turn.response.suggestedActions} />
                    {turn.draft ? (
                      <div className="mt-3 rounded-lg border border-dashed border-[var(--color-border-strong)] p-3">
                        <p className="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
                          Rascunho <Badge tone="neutral">Revise antes de usar</Badge>
                        </p>
                        <p className="mt-1 text-sm whitespace-pre-wrap">{turn.draft}</p>
                      </div>
                    ) : null}
                    {turn.suggestedAction ? (
                      <ApplySuggestion action={turn.suggestedAction} />
                    ) : null}
                    {turn.response.sources.length > 0 ? (
                      <p className="mt-2 text-xs text-[var(--color-muted)]">
                        Fontes:{' '}
                        {turn.response.sources.map((source, sourceIndex) => {
                          const href =
                            source.href ??
                            (source.documentId
                              ? `/dashboard/base-conhecimento/${source.documentId}`
                              : null);
                          return (
                            <span key={`${source.kind}-${sourceIndex}`}>
                              {sourceIndex > 0 ? ' · ' : ''}
                              {href ? (
                                <Link
                                  className="underline hover:text-[var(--color-primary)]"
                                  href={href}
                                >
                                  {source.label}
                                </Link>
                              ) : (
                                source.label
                              )}
                            </span>
                          );
                        })}
                      </p>
                    ) : null}
                    {canSeeUsage && turn.response.usage ? (
                      <p className="mt-2 text-xs text-[var(--color-muted)]">
                        Uso: {formatUsage(turn.response.usage)}
                      </p>
                    ) : null}
                    {turn.response.warnings && turn.response.warnings.length > 0 ? (
                      <p className="mt-2 text-xs text-[var(--color-muted)]">
                        {turn.response.warnings.join(' ')}
                      </p>
                    ) : null}
                    <div className="flex items-center gap-1 pt-1">
                      <button
                        aria-label="Copiar resposta"
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                        onClick={() => {
                          const text = [
                            turn.response.summary,
                            ...turn.response.facts,
                          ].join('\n');
                          navigator.clipboard?.writeText(text).then(
                            () => setCopiedIndex(index),
                            () => setCopiedIndex(null),
                          );
                          window.setTimeout(() => setCopiedIndex(null), 2000);
                        }}
                        type="button"
                      >
                        <Copy aria-hidden="true" className="h-4 w-4" />
                      </button>
                      {copiedIndex === index ? (
                        <span className="text-xs text-[var(--color-muted)]">Copiado!</span>
                      ) : null}
                      <button
                        aria-label="Resposta útil"
                        className={cn(
                          'rounded-lg p-2 hover:bg-slate-100',
                          feedback[index] === 'up' ? 'text-green-700' : 'text-slate-500',
                        )}
                        onClick={() => setFeedback((current) => ({ ...current, [index]: 'up' }))}
                        type="button"
                      >
                        <ThumbsUp aria-hidden="true" className="h-4 w-4" />
                      </button>
                      <button
                        aria-label="Resposta não útil"
                        className={cn(
                          'rounded-lg p-2 hover:bg-slate-100',
                          feedback[index] === 'down' ? 'text-red-700' : 'text-slate-500',
                        )}
                        onClick={() => setFeedback((current) => ({ ...current, [index]: 'down' }))}
                        type="button"
                      >
                        <ThumbsDown aria-hidden="true" className="h-4 w-4" />
                      </button>
                      <button
                        aria-label="Refazer pergunta"
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                        onClick={() => {
                          const previous = [...turns].reverse().find((item) => item.kind === 'user');
                          if (previous && previous.kind === 'user') {
                            abortRef.current?.abort();
                            sendingRef.current = false;
                            streamIdRef.current = null;
                            setTurns((current) => current.slice(0, -1));
                            void send({ message: previous.text, promptId: 'commercial-copilot' });
                          }
                        }}
                        type="button"
                      >
                        <RotateCcw aria-hidden="true" className="h-4 w-4" />
                      </button>
                    </div>
                  </Card>
                ),
              )}
              {state === 'loading' ? (
                <p role="status" className="text-sm text-[var(--color-muted)]">
                  Analisando dados autorizados…
                  <button
                    className="ml-2 underline"
                    onClick={() => abortRef.current?.abort()}
                    type="button"
                  >
                    Cancelar
                  </button>
                </p>
              ) : null}
              {state === 'error' && errorKind ? (
                <Alert tone="danger">
                  {serverMessage ?? ERROR_MESSAGES[errorKind]}
                </Alert>
              ) : null}
            </div>
            <div className="space-y-2 border-t border-[var(--color-border)] px-5 py-3">
              <div className="flex flex-wrap gap-2">
                {shortcuts.map((shortcut) => (
                  <button
                    key={shortcut.label}
                    className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                    disabled={state === 'loading'}
                    onClick={() => void send({ message: shortcut.message, promptId: shortcut.promptId })}
                    type="button"
                  >
                    {shortcut.label}
                  </button>
                ))}
              </div>
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void send({ message: input, promptId: 'commercial-copilot' });
                }}
              >
                <input
                  aria-label="Pergunte ao Larcarvalho AI"
                  className="min-h-10 flex-1 rounded-lg border border-[var(--color-border)] px-3 text-sm"
                  disabled={state === 'loading'}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Pergunte ao Larcarvalho AI..."
                  value={input}
                />
                <Button disabled={state === 'loading' || input.trim() === ''} type="submit" aria-label="Enviar pergunta">
                  <Send aria-hidden="true" className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
