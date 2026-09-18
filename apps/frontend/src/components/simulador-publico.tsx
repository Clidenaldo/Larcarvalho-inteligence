'use client';

import {
  simuladorPublicoResponseSchema,
  type SimuladorPublicoPerfil,
  type SimuladorPublicoResponse,
} from '@larcarvalho/shared';
import { ArrowLeft, ArrowRight, Check, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { normalizeBrlInput } from '../lib/simulador';
import { formatBrl } from '../lib/formatters';
import { LeadContactForm } from './lead-contact-form';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Field, Input } from './ui/field';
import { creditBand, trackPublicEvent } from '../lib/analytics';

const categories = [
  ['IMOVEL', 'Imóvel'],
  ['AUTOMOVEL', 'Automóvel'],
  ['MOTOCICLETA', 'Motocicleta'],
  ['PESADOS', 'Veículos pesados'],
  ['SERVICOS', 'Serviços'],
  ['OUTROS', 'Outros'],
] as const;
const componentLabels = {
  CREDITO: 'Crédito',
  PARCELA: 'Parcela',
  PRAZO: 'Prazo',
  HISTORICO_LANCES: 'Histórico observado de lances',
  COBERTURA_HISTORICA: 'Cobertura histórica',
  CARACTERISTICAS_GRUPO: 'Características do grupo',
  QUALIDADE_DADOS: 'Disponibilidade dos dados',
} as const;
const classificationLabels = {
  ALTA_ADERENCIA: 'Alta aderência',
  ADERENCIA_MODERADA: 'Aderência moderada',
  BAIXA_ADERENCIA: 'Baixa aderência',
  MUITO_BAIXA_ADERENCIA: 'Muito baixa aderência',
} as const;
const historyLabels = {
  DADOS_DISPONIVEIS: 'Dados disponíveis',
  DADOS_HISTORICOS_PARCIAIS: 'Dados históricos parciais',
  DADOS_INSUFICIENTES: 'Dados históricos insuficientes',
} as const;

export interface SimulatorFormState {
  categoria: SimuladorPublicoPerfil['categoria'] | '';
  credito: string;
  parcela: string;
  prazo: string;
  lanceIntent: 'INDEFINIDO' | 'NAO' | 'SIM';
  lance: string;
}
export const publicSimulationInitialForm: SimulatorFormState = {
  categoria: '',
  credito: '',
  parcela: '',
  prazo: '',
  lanceIntent: 'INDEFINIDO',
  lance: '',
};

const money = (value: string | null) =>
  value === null ? 'Não disponível' : formatBrl(Number(value));

export function buildPublicSimulationProfile(
  form: SimulatorFormState,
): SimuladorPublicoPerfil | null {
  const credit = normalizeBrlInput(form.credito);
  const installment = form.parcela.trim()
    ? normalizeBrlInput(form.parcela)
    : undefined;
  const term = form.prazo.trim() ? Number(form.prazo) : undefined;
  const bid = form.lanceIntent === 'SIM' ? Number(form.lance) : undefined;
  if (
    !form.categoria ||
    !credit ||
    (form.parcela.trim() && !installment) ||
    (term !== undefined &&
      (!Number.isInteger(term) || term < 1 || term > 1200)) ||
    (bid !== undefined && (!Number.isFinite(bid) || bid < 0 || bid > 100))
  )
    return null;
  return {
    categoria: form.categoria,
    valorCreditoDesejado: credit,
    ...(installment ? { parcelaMaxima: installment } : {}),
    ...(term !== undefined ? { prazoMaximo: term } : {}),
    ...(bid !== undefined ? { lanceDisponivelPercentual: String(bid) } : {}),
  };
}

export function validatePublicSimulationStep(
  form: SimulatorFormState,
  step: number,
): string | null {
  if (step === 0 && !form.categoria) return 'Escolha o tipo de bem.';
  if (step === 1 && !normalizeBrlInput(form.credito))
    return 'Informe um valor de crédito válido e maior que zero.';
  if (step === 2 && form.parcela.trim() && !normalizeBrlInput(form.parcela))
    return 'Informe uma parcela válida ou deixe o campo vazio.';
  if (
    step === 3 &&
    form.prazo.trim() &&
    (!Number.isInteger(Number(form.prazo)) ||
      Number(form.prazo) < 1 ||
      Number(form.prazo) > 1200)
  )
    return 'Informe o prazo em meses entre 1 e 1200.';
  if (
    step === 4 &&
    form.lanceIntent === 'SIM' &&
    (!form.lance.trim() || Number(form.lance) < 0 || Number(form.lance) > 100)
  )
    return 'Informe um percentual de lance entre 0 e 100.';
  return null;
}

export function SimuladorPublico({
  apiBaseUrl,
  initialCategory,
  initialCredit,
  privacyPolicyUrl,
  whatsappNumber,
}: {
  apiBaseUrl: string;
  initialCategory?: SimuladorPublicoPerfil['categoria'] | undefined;
  initialCredit?: string | undefined;
  privacyPolicyUrl: string | null;
  whatsappNumber: string | null;
}) {
  const [form, setForm] = useState<SimulatorFormState>(() => ({
    ...publicSimulationInitialForm,
    categoria: initialCategory ?? '',
    credito: initialCredit ?? '',
  }));
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimuladorPublicoResponse | null>(null);
  const profile = buildPublicSimulationProfile(form);

  const simulate = async (page = 1) => {
    const validProfile = buildPublicSimulationProfile(form);
    if (!validProfile) {
      setError('Revise os dados informados antes de simular.');
      return;
    }
    setLoading(true);
    trackPublicEvent('SIMULATION_STARTED', {
      path: window.location.pathname,
      category: validProfile.categoria,
      metadata: { creditBand: creditBand(form.credito) },
    });
    setResult(null);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/public/simulador`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ perfil: validProfile, page, pageSize: 6 }),
      });
      if (!response.ok) throw new Error('simulation failed');
      setResult(simuladorPublicoResponseSchema.parse(await response.json()));
      setStep(5);
      trackPublicEvent('SIMULATION_COMPLETED', {
        path: window.location.pathname,
        category: validProfile.categoria,
        metadata: { creditBand: creditBand(form.credito) },
      });
      trackPublicEvent('RESULTS_VIEWED', {
        path: window.location.pathname,
        category: validProfile.categoria,
        metadata: { creditBand: creditBand(form.credito) },
      });
    } catch {
      setError(
        'Não foi possível concluir sua simulação agora. Tente novamente em alguns instantes.',
      );
    } finally {
      setLoading(false);
    }
  };

  const advance = () => {
    const validation = validatePublicSimulationStep(form, step);
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    if (step === 4) void simulate();
    else setStep((current) => current + 1);
  };

  const reset = () => {
    setForm(publicSimulationInitialForm);
    setResult(null);
    setError(null);
    setStep(0);
  };

  return (
    <Card className="public-simulator overflow-hidden shadow-[var(--shadow-md)]">
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-5 sm:px-8">
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="font-semibold">
            {step < 5 ? `Etapa ${step + 1} de 5` : 'Resultado da simulação'}
          </span>
          <span className="text-[var(--color-muted)]">
            {step < 5 ? `${Math.round(((step + 1) / 5) * 100)}%` : 'Concluído'}
          </span>
        </div>
        <div
          aria-label={`Progresso: ${step < 5 ? step + 1 : 5} de 5 etapas`}
          aria-valuemax={5}
          aria-valuemin={1}
          aria-valuenow={step < 5 ? step + 1 : 5}
          className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-surface-subtle)]"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-[var(--color-primary)] transition-[width]"
            style={{ width: `${Math.min(100, ((step + 1) / 5) * 100)}%` }}
          />
        </div>
      </div>

      <div
        aria-busy={loading}
        aria-live="polite"
        className="bg-[var(--color-surface)] p-5 sm:p-8"
      >
        {step === 0 ? (
          <fieldset>
            <legend className="text-xl font-semibold">
              Que tipo de bem você procura?
            </legend>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map(([value, label]) => (
                <label
                  className={`flex min-h-14 items-center gap-3 rounded-xl border p-4 font-semibold ${form.categoria === value ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)]' : 'border-[var(--color-border)]'}`}
                  key={value}
                >
                  <input
                    checked={form.categoria === value}
                    name="categoria"
                    onChange={() =>
                      setForm((current) => ({ ...current, categoria: value }))
                    }
                    type="radio"
                    value={value}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {step === 1 ? (
          <div className="mx-auto max-w-lg">
            <h2 className="text-xl font-semibold">Qual crédito você deseja?</h2>
            <Field label="Valor do crédito" required>
              <Input
                aria-describedby="simulation-help simulation-error"
                autoFocus
                inputMode="decimal"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    credito: event.target.value,
                  }))
                }
                placeholder="R$ 150.000"
                value={form.credito}
              />
            </Field>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mx-auto max-w-lg">
            <h2 className="text-xl font-semibold">
              Quanto você pretende pagar por mês?
            </h2>
            <Field
              help="Opcional. O resultado depende das parcelas conhecidas nos grupos."
              label="Parcela máxima"
            >
              <Input
                aria-describedby="simulation-help simulation-error"
                autoFocus
                inputMode="decimal"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    parcela: event.target.value,
                  }))
                }
                placeholder="R$ 1.500"
                value={form.parcela}
              />
            </Field>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="mx-auto max-w-lg">
            <h2 className="text-xl font-semibold">
              Em quanto tempo pretende pagar?
            </h2>
            <Field
              help="Opcional. Informe o prazo máximo em meses."
              label="Prazo máximo"
            >
              <Input
                aria-describedby="simulation-help simulation-error"
                autoFocus
                inputMode="numeric"
                max="1200"
                min="1"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    prazo: event.target.value,
                  }))
                }
                type="number"
                value={form.prazo}
              />
            </Field>
            <div className="mt-3 flex flex-wrap gap-2">
              {[36, 48, 60, 72, 84, 120].map((months) => (
                <button
                  className="rounded-full border border-[var(--color-border-strong)] px-3 py-2 text-sm"
                  key={months}
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      prazo: String(months),
                    }))
                  }
                  type="button"
                >
                  {months} meses
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <fieldset className="mx-auto max-w-lg">
            <legend className="text-xl font-semibold">
              Você pretende ofertar lance?
            </legend>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {[
                ['INDEFINIDO', 'Não sei ainda'],
                ['NAO', 'Não'],
                ['SIM', 'Sim'],
              ].map(([value, label]) => (
                <label
                  className="rounded-xl border border-[var(--color-border)] p-3 text-center text-sm font-semibold"
                  key={value}
                >
                  <input
                    checked={form.lanceIntent === value}
                    className="mr-2"
                    name="lanceIntent"
                    onChange={() =>
                      setForm((current) => ({
                        ...current,
                        lanceIntent: value as SimulatorFormState['lanceIntent'],
                      }))
                    }
                    type="radio"
                  />
                  {label}
                </label>
              ))}
            </div>
            {form.lanceIntent === 'SIM' ? (
              <div className="mt-5">
                <Field
                  help="Percentual aproximado do crédito. Não convertemos valor em percentual automaticamente."
                  label="Lance disponível (%)"
                  required
                >
                  <Input
                    aria-describedby="simulation-help simulation-error"
                    inputMode="decimal"
                    max="100"
                    min="0"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        lance: event.target.value,
                      }))
                    }
                    value={form.lance}
                  />
                </Field>
              </div>
            ) : null}
          </fieldset>
        ) : null}

        {loading ? (
          <div className="py-14 text-center" role="status">
            <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-[var(--color-primary-soft)] border-t-[var(--color-primary)]" />
            <p className="mt-4 font-semibold">Buscando opções compatíveis…</p>
          </div>
        ) : null}

        {step === 5 && result && !loading ? (
          <div>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold">Opções encontradas</h2>
                <p className="mt-1 text-sm text-[var(--color-muted)]">
                  Ordenadas por maior aderência ao seu perfil dentro do conjunto
                  avaliado.
                </p>
              </div>
              <Button onClick={reset} variant="outline">
                <RotateCcw aria-hidden="true" className="h-4 w-4" /> Nova
                simulação
              </Button>
            </div>
            {result.limiteAtingido ? (
              <div className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                Existem mais de {result.limiteCandidatos} candidatos. Refine os
                critérios para uma avaliação mais abrangente.
              </div>
            ) : null}
            {result.items.length === 0 ? (
              <div className="py-12 text-center">
                <h3 className="text-lg font-semibold">
                  Não encontramos opções compatíveis com todos os critérios
                  informados.
                </h3>
                <p className="mt-2 text-sm text-[var(--color-muted)]">
                  Ajuste os valores ou fale com um especialista.
                </p>
                <Button
                  className="mt-5"
                  onClick={() => setStep(1)}
                  variant="outline"
                >
                  Ajustar valores
                </Button>
                {profile ? (
                  <LeadContactForm
                    apiBaseUrl={apiBaseUrl}
                    perfil={profile}
                    privacyPolicyUrl={privacyPolicyUrl}
                    whatsappNumber={whatsappNumber}
                  />
                ) : null}
              </div>
            ) : (
              <div className="mt-6 grid gap-5 lg:grid-cols-2">
                {result.items.map((item) => {
                  return (
                    <article
                      className="public-result rounded-2xl border border-[var(--color-border)] p-5 shadow-sm"
                      key={`${item.administradora}-${item.grupo}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                            {item.administradora}
                          </p>
                          <h3 className="mt-1 text-xl font-semibold">
                            {item.origem === 'GRUPO'
                              ? `Grupo ${item.grupo}`
                              : `Plano comercial ${item.grupo}`}
                          </h3>
                        </div>
                        {item.indiceAderencia === null ? (
                          <Badge tone="warning">Dados insuficientes</Badge>
                        ) : (
                          <div className="text-right">
                            <strong className="text-2xl text-[var(--color-primary)]">
                              {item.indiceAderencia}/100
                            </strong>
                            <p className="text-xs">
                              {classificationLabels[item.classificacao!]}
                            </p>
                          </div>
                        )}
                      </div>
                      <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <dt className="text-[var(--color-muted)]">Tipo</dt>
                          <dd className="font-semibold">
                            {
                              categories.find(
                                ([value]) => value === item.categoria,
                              )?.[1]
                            }
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[var(--color-muted)]">Prazo</dt>
                          <dd className="font-semibold">
                            {item.prazoMeses
                              ? `${item.prazoMeses} meses`
                              : 'Não disponível'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[var(--color-muted)]">Crédito</dt>
                          <dd className="font-semibold">
                            {money(item.credito.minimo)} a{' '}
                            {money(item.credito.maximo)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[var(--color-muted)]">
                            Parcela conhecida
                          </dt>
                          <dd className="font-semibold">
                            {money(item.parcelaConhecida)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[var(--color-muted)]">
                            Cobertura da avaliação
                          </dt>
                          <dd className="font-semibold">
                            {item.coberturaAvaliacao}%
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[var(--color-muted)]">
                            Histórico
                          </dt>
                          <dd className="font-semibold">
                            {historyLabels[item.historicoStatus]}
                          </dd>
                        </div>
                      </dl>
                      <details className="mt-5 rounded-xl bg-[var(--color-surface-subtle)] p-4">
                        <summary className="font-semibold">
                          Entender este resultado
                        </summary>
                        <div className="mt-4 space-y-4">
                          {item.componentes.map((component) => (
                            <section
                              className="border-t border-[var(--color-border)] pt-3 first:border-0 first:pt-0"
                              key={component.nome}
                            >
                              <div className="flex justify-between gap-3 text-sm font-semibold">
                                <span>{componentLabels[component.nome]}</span>
                                <span>
                                  {component.pontuacaoPonderada === null
                                    ? 'Indisponível'
                                    : `${component.pontuacaoPonderada}/${component.pesoAvaliado}`}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-[var(--color-muted)]">
                                {component.explicacao}
                              </p>
                            </section>
                          ))}
                          <div className="border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-muted)]">
                            <p>
                              Histórico observado: mínimo{' '}
                              {item.historicoObservado.lanceMinimo ??
                                'indisponível'}
                              %, mediana{' '}
                              {item.historicoObservado.lanceMediano ??
                                'indisponível'}
                              % e máximo{' '}
                              {item.historicoObservado.lanceMaximo ??
                                'indisponível'}
                              %.
                            </p>
                            <p className="mt-2">
                              Os dados de lances representam registros
                              históricos disponíveis e não determinam resultados
                              futuros.
                            </p>
                          </div>
                        </div>
                      </details>
                      {profile ? (
                        <LeadContactForm
                          apiBaseUrl={apiBaseUrl}
                          interesse={item}
                          perfil={profile}
                          privacyPolicyUrl={privacyPolicyUrl}
                          whatsappNumber={whatsappNumber}
                        />
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
            {result.totalPages > 1 ? (
              <nav
                aria-label="Páginas de resultados"
                className="mt-7 flex items-center justify-center gap-3"
              >
                <Button
                  disabled={result.page <= 1}
                  onClick={() => void simulate(result.page - 1)}
                  variant="outline"
                >
                  Anterior
                </Button>
                <span className="text-sm">
                  Página {result.page} de {result.totalPages}
                </span>
                <Button
                  disabled={result.page >= result.totalPages}
                  onClick={() => void simulate(result.page + 1)}
                  variant="outline"
                >
                  Próxima
                </Button>
              </nav>
            ) : null}
            <div className="mt-8 rounded-xl bg-[var(--color-primary-soft)] p-5">
              <h3 className="font-semibold">Como calculamos</h3>
              <p className="mt-2 text-sm text-[var(--color-text-soft)]">
                O índice compara seus critérios com informações conhecidas dos
                grupos, como crédito, parcela, prazo e histórico observado.
              </p>
            </div>
            <p className="mt-6 text-xs leading-5 text-[var(--color-muted)]">
              {result.disclaimer}
            </p>
          </div>
        ) : null}

        {error ? (
          <p
            className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-[var(--color-danger)]"
            id="simulation-error"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <p className="sr-only" id="simulation-help">
          Os campos marcados são necessários para a simulação.
        </p>

        {step < 5 && !loading ? (
          <div className="mt-8 flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-5">
            <Button
              disabled={step === 0}
              onClick={() => {
                setError(null);
                setStep((current) => Math.max(0, current - 1));
              }}
              variant="ghost"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Voltar
            </Button>
            <Button onClick={advance}>
              {step === 4 ? (
                <Check aria-hidden="true" className="h-4 w-4" />
              ) : null}
              {step === 4 ? 'Simular opções' : 'Continuar'}
              {step < 4 ? (
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              ) : null}
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
