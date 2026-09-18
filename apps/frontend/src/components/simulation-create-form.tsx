'use client';
import { HelpLabel } from './ui/field-help';

import type { SimulationCatalog } from '@larcarvalho/shared';

import type { Lead, Simulation } from '@larcarvalho/shared';
import {
  Bike,
  Calculator,
  Car,
  Home,
  Minus,
  Plus,
  RotateCcw,
  Star,
  Truck,
  Wrench,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { formatBrl } from '../lib/formatters';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Field, Input, Select } from './ui/field';

const categories = [
  { icon: Home, label: 'Imóvel', value: 'IMOVEL' },
  { icon: Car, label: 'Automóvel', value: 'AUTOMOVEL' },
  { icon: Bike, label: 'Moto', value: 'MOTOCICLETA' },
  { icon: Truck, label: 'Caminhão', value: 'PESADOS' },
  { icon: Wrench, label: 'Serviços', value: 'SERVICOS' },
] as const;

const creditModes = [
  {
    hint: 'O sistema estima crédito líquido, taxas e lances.',
    label: 'Crédito Contratado',
    value: 'CONTRACTED_CREDIT',
  },
  {
    hint: 'O sistema busca o contratado necessário para chegar no líquido.',
    label: 'Crédito Líquido',
    value: 'NET_CREDIT',
  },
  {
    hint: 'O crédito contratado é derivado do valor da categoria pela regra.',
    label: 'Valor da categoria',
    value: 'CATEGORY_VALUE',
  },
] as const;

const frequentCredits = [120000, 180000, 250000, 400000, 600000];
const frequentBids = [0, 5000, 10000, 25000, 50000];

async function errorMessage(response: Response) {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string };
    };
    return payload.error?.message ?? 'Não foi possível concluir a operação.';
  } catch {
    return 'Não foi possível concluir a operação.';
  }
}

function parseNumber(value: string) {
  return Number(value.replace(',', '.'));
}

function moneyLabel(value: string) {
  const number = parseNumber(value);
  return Number.isFinite(number) && number > 0
    ? formatBrl(number)
    : 'Não informado';
}

function numberString(value: number) {
  return Math.max(0, value).toFixed(2);
}

function toggleSet(current: Set<string>, id: string) {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function MoneyInput({
  label,
  name,
  onChange,
  required,
  shortcuts,
  step,
  value,
}: {
  readonly label: string;
  readonly name: string;
  readonly onChange: (value: string) => void;
  readonly required?: boolean;
  readonly shortcuts: readonly number[];
  readonly step: number;
  readonly value: string;
}) {
  const number = parseNumber(value || '0');
  const valid = Number.isFinite(number) && (!required || number > 0);
  const adjust = (delta: number) =>
    onChange(numberString((number || 0) + delta));
  return (
    <Field
      helpKey={
        name === 'ownBidAmount' ? 'simulation.ownBid' : 'simulation.credit'
      }
      error={valid ? undefined : 'Informe um valor maior que zero.'}
      label={label}
      required={required}
    >
      <div className="flex gap-2">
        <Button
          aria-label={`Reduzir ${label}`}
          onClick={() => adjust(-step)}
          type="button"
          variant="outline"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Input
          aria-invalid={!valid}
          inputMode="decimal"
          name={name}
          onChange={(event) => onChange(event.target.value)}
          pattern="[0-9]+([,.][0-9]{1,2})?"
          placeholder="200000.00"
          required={required}
          value={value}
        />
        <Button
          aria-label={`Aumentar ${label}`}
          onClick={() => adjust(step)}
          type="button"
          variant="outline"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {shortcuts.map((shortcut) => (
          <button
            className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-soft)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
            key={shortcut}
            onClick={() => onChange(numberString(shortcut))}
            type="button"
          >
            {formatBrl(shortcut)}
          </button>
        ))}
      </div>
    </Field>
  );
}

export function SimulationCreateForm({
  administrators,
  products,
  groups,
  quotas,
  leads,
  favoriteAdministratorIds,
  favoriteProductIds,
}: {
  readonly administrators: SimulationCatalog['administrators'];
  readonly products: SimulationCatalog['products'];
  readonly groups: SimulationCatalog['groups'];
  readonly quotas: SimulationCatalog['quotas'];
  readonly leads: Lead[];
  readonly favoriteAdministratorIds: string[];
  readonly favoriteProductIds: string[];
}) {
  const router = useRouter();
  const [category, setCategory] = useState('IMOVEL');
  const [creditMode, setCreditMode] = useState('CONTRACTED_CREDIT');
  const [requestedCredit, setRequestedCredit] = useState('');
  const [desiredTermMonths, setDesiredTermMonths] = useState('120');
  const [ownBidAmount, setOwnBidAmount] = useState('0.00');
  const [embeddedBidPercent, setEmbeddedBidPercent] = useState('0');
  const [paidInstallments, setPaidInstallments] = useState('0');
  const [structuredOperation, setStructuredOperation] = useState(false);
  const [leadId, setLeadId] = useState('');
  const [sort, setSort] = useState('ADHERENCE');
  const [notes, setNotes] = useState('');
  const [selectedAdministrators, setSelectedAdministrators] = useState(
    new Set<string>(),
  );
  const [selectedProducts, setSelectedProducts] = useState(new Set<string>());
  const [selectedGroups, setSelectedGroups] = useState(new Set<string>());
  const [selectedQuotas, setSelectedQuotas] = useState(new Set<string>());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [favoriteAdministrators, setFavoriteAdministrators] = useState(
    new Set(favoriteAdministratorIds),
  );
  const [favoriteProducts, setFavoriteProducts] = useState(
    new Set(favoriteProductIds),
  );

  const filteredProducts = useMemo(
    () => products.filter((product) => product.categoria === category),
    [category, products],
  );
  const filteredGroups = useMemo(
    () =>
      groups.filter(
        (group) => !group.produto || group.produto.categoria === category,
      ),
    [category, groups],
  );
  const filteredQuotas = useMemo(
    () =>
      quotas.filter(
        (quota) =>
          !quota.grupo.produto || quota.grupo.produto.categoria === category,
      ),
    [category, quotas],
  );
  const selectedLead = leads.find((lead) => lead.id === leadId);
  const selectedCategory =
    categories.find((item) => item.value === category)?.label ?? category;
  const requestedCreditValid = parseNumber(requestedCredit) > 0;
  const termValid =
    Number.isInteger(Number(desiredTermMonths)) &&
    Number(desiredTermMonths) >= 1 &&
    Number(desiredTermMonths) <= 1200;
  const hasFilledData =
    requestedCredit !== '' ||
    ownBidAmount !== '0.00' ||
    embeddedBidPercent !== '0' ||
    paidInstallments !== '0' ||
    leadId !== '' ||
    notes !== '' ||
    selectedAdministrators.size > 0 ||
    selectedProducts.size > 0 ||
    selectedGroups.size > 0 ||
    selectedQuotas.size > 0;

  const toggleCatalogFavorite = async (
    type: 'ADMINISTRATOR' | 'PRODUCT',
    id: string,
  ) => {
    const current =
      type === 'ADMINISTRATOR'
        ? favoriteAdministrators.has(id)
        : favoriteProducts.has(id);
    const response = await fetch(`/api/simulations/favorites/${type}/${id}`, {
      method: current ? 'DELETE' : 'POST',
    });
    if (!response.ok) {
      setError(await errorMessage(response));
      return;
    }
    const update = (previous: Set<string>) => {
      const next = new Set(previous);
      if (current) next.delete(id);
      else next.add(id);
      return next;
    };
    if (type === 'ADMINISTRATOR') setFavoriteAdministrators(update);
    else setFavoriteProducts(update);
  };

  const clear = () => {
    if (hasFilledData && !window.confirm('Limpar os dados preenchidos?'))
      return;
    setCategory('IMOVEL');
    setCreditMode('CONTRACTED_CREDIT');
    setRequestedCredit('');
    setDesiredTermMonths('120');
    setOwnBidAmount('0.00');
    setEmbeddedBidPercent('0');
    setPaidInstallments('0');
    setStructuredOperation(false);
    setLeadId('');
    setSort('ADHERENCE');
    setNotes('');
    setSelectedAdministrators(new Set());
    setSelectedProducts(new Set());
    setSelectedGroups(new Set());
    setSelectedQuotas(new Set());
    setError(null);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requestedCreditValid || !termValid) {
      setError('Revise crédito e prazo antes de simular.');
      return;
    }
    setLoading(true);
    setError(null);
    const body = {
      category,
      creditMode,
      requestedCredit: requestedCredit.replace(',', '.'),
      desiredTermMonths: Number(desiredTermMonths),
      ownBidAmount: ownBidAmount.replace(',', '.') || '0',
      embeddedBidPercent: embeddedBidPercent.replace(',', '.') || '0',
      paidInstallments: Number(paidInstallments || 0),
      structuredOperation,
      administratorIds: [...selectedAdministrators],
      productIds: [...selectedProducts],
      groupIds: [...selectedGroups],
      quotaIds: [...selectedQuotas],
      ...(leadId ? { leadId } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      sort,
    };
    try {
      const createdResponse = await fetch('/api/simulations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!createdResponse.ok)
        throw new Error(await errorMessage(createdResponse));
      const simulation = (await createdResponse.json()) as Simulation;
      const calculationResponse = await fetch(
        `/api/simulations/${simulation.id}/calculate`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            scenarioName: 'Cenário principal',
            sort,
            pin: true,
          }),
        },
      );
      if (!calculationResponse.ok)
        throw new Error(await errorMessage(calculationResponse));
      router.push(`/simulacoes/${simulation.id}`);
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Falha inesperada');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      className="simulation-surface grid gap-6 rounded-2xl xl:grid-cols-[minmax(0,1fr)_22rem]"
      onSubmit={submit}
    >
      <div className="space-y-6">
        <Card className="p-5 sm:p-7">
          <fieldset>
            <legend className="text-lg font-semibold">Categoria</legend>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {categories.map(({ icon: Icon, label, value }) => (
                <HelpLabel
                  helpKey="common.category"
                  className={`rounded-xl border p-4 text-sm font-semibold ${category === value ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)] ring-2 ring-[var(--color-primary-soft)]' : 'border-[var(--color-border)] bg-white text-[var(--color-text-soft)]'}`}
                  key={value}
                >
                  <input
                    checked={category === value}
                    className="sr-only"
                    name="category"
                    onChange={() => setCategory(value)}
                    type="radio"
                    value={value}
                  />
                  <Icon aria-hidden="true" className="mb-3 h-5 w-5" />
                  {label}
                </HelpLabel>
              ))}
            </div>
          </fieldset>
          <fieldset className="mt-7">
            <legend className="text-lg font-semibold">Tipo de crédito</legend>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {creditModes.map((mode) => (
                <HelpLabel
                  helpKey="simulation.creditMode"
                  className={`rounded-xl border p-4 ${creditMode === mode.value ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)]' : 'border-[var(--color-border)] bg-white'}`}
                  key={mode.value}
                >
                  <input
                    checked={creditMode === mode.value}
                    className="sr-only"
                    name="creditMode"
                    onChange={() => setCreditMode(mode.value)}
                    type="radio"
                    value={mode.value}
                  />
                  <span className="block font-semibold">{mode.label}</span>
                  <span className="mt-1 block text-sm text-[var(--color-muted)]">
                    {mode.hint}
                  </span>
                </HelpLabel>
              ))}
            </div>
          </fieldset>
          <div className="mt-7 grid gap-5 md:grid-cols-2">
            <MoneyInput
              label={
                creditMode === 'CATEGORY_VALUE'
                  ? 'Valor da categoria'
                  : 'Valor do crédito'
              }
              name="requestedCredit"
              onChange={setRequestedCredit}
              required
              shortcuts={frequentCredits}
              step={10000}
              value={requestedCredit}
            />
            <Field
              helpKey="simulation.term"
              error={
                termValid ? undefined : 'Informe prazo entre 1 e 1200 meses.'
              }
              label="Prazo desejado (meses)"
              required
            >
              <div className="flex gap-2">
                <Button
                  aria-label="Reduzir prazo"
                  onClick={() =>
                    setDesiredTermMonths(
                      String(Math.max(1, Number(desiredTermMonths || 1) - 12)),
                    )
                  }
                  type="button"
                  variant="outline"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  aria-invalid={!termValid}
                  max="1200"
                  min="1"
                  name="desiredTermMonths"
                  onChange={(event) => setDesiredTermMonths(event.target.value)}
                  required
                  type="number"
                  value={desiredTermMonths}
                />
                <Button
                  aria-label="Aumentar prazo"
                  onClick={() =>
                    setDesiredTermMonths(
                      String(
                        Math.min(1200, Number(desiredTermMonths || 0) + 12),
                      ),
                    )
                  }
                  type="button"
                  variant="outline"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </Field>
            <MoneyInput
              label="Lance próprio disponível"
              name="ownBidAmount"
              onChange={setOwnBidAmount}
              shortcuts={frequentBids}
              step={5000}
              value={ownBidAmount}
            />
            <Field helpKey="simulation.embedded" label="Lance embutido (%)">
              <Input
                max="100"
                min="0"
                name="embeddedBidPercent"
                onChange={(event) => setEmbeddedBidPercent(event.target.value)}
                step="0.0001"
                type="number"
                value={embeddedBidPercent}
              />
            </Field>
            <Field helpKey="simulation.paid" label="Parcelas já pagas">
              <Input
                max="1200"
                min="0"
                name="paidInstallments"
                onChange={(event) => setPaidInstallments(event.target.value)}
                type="number"
                value={paidInstallments}
              />
            </Field>
            <Field helpKey="proposal.client" label="Lead / cliente">
              <Select
                name="leadId"
                onChange={(event) => setLeadId(event.target.value)}
                value={leadId}
              >
                <option value="">Sem vínculo neste momento</option>
                {leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              helpKey="simulation.sort"
              label="Ordenação persistida no cenário"
            >
              <Select
                name="sort"
                onChange={(event) => setSort(event.target.value)}
                value={sort}
              >
                <option value="ADHERENCE">Maior aderência</option>
                <option value="LOWEST_INSTALLMENT">Menor parcela</option>
                <option value="HIGHEST_NET_CREDIT">
                  Maior crédito líquido
                </option>
                <option value="SHORTEST_TERM">Menor prazo</option>
              </Select>
            </Field>
            <HelpLabel
              helpKey="simulation.structured"
              className="flex min-h-11 items-center gap-3 self-end rounded-xl border border-[var(--color-border)] px-4 text-sm font-medium"
            >
              <input
                checked={structuredOperation}
                name="structuredOperation"
                onChange={(event) =>
                  setStructuredOperation(event.target.checked)
                }
                type="checkbox"
              />{' '}
              Operação estruturada
            </HelpLabel>
          </div>
        </Card>

        <Card className="p-5 sm:p-7">
          <h3 className="text-lg font-semibold">Origem comercial</h3>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Sem seleção, todas as regras compatíveis serão avaliadas.
          </p>
          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            <fieldset>
              <legend className="text-sm font-semibold">Administradoras</legend>
              <div className="mt-3 max-h-44 space-y-2 overflow-auto rounded-xl border p-3">
                {administrators.map((item) => (
                  <div className="flex items-center gap-2" key={item.id}>
                    <HelpLabel
                      helpKey="simulation.selection"
                      className="min-w-0 flex-1 text-sm"
                    >
                      <input
                        checked={selectedAdministrators.has(item.id)}
                        className="mr-2"
                        name="administratorIds"
                        onChange={() =>
                          setSelectedAdministrators((current) =>
                            toggleSet(current, item.id),
                          )
                        }
                        type="checkbox"
                        value={item.id}
                      />
                      {item.nome}
                    </HelpLabel>
                    <button
                      aria-label={`${favoriteAdministrators.has(item.id) ? 'Desfavoritar' : 'Favoritar'} administradora ${item.nome}`}
                      onClick={() =>
                        void toggleCatalogFavorite('ADMINISTRATOR', item.id)
                      }
                      type="button"
                    >
                      <Star
                        className={`h-4 w-4 ${favoriteAdministrators.has(item.id) ? 'fill-amber-400 text-amber-500' : 'text-[var(--color-muted)]'}`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-sm font-semibold">Produtos</legend>
              <div className="mt-3 max-h-44 space-y-2 overflow-auto rounded-xl border p-3">
                {filteredProducts.length ? (
                  filteredProducts.map((item) => (
                    <div className="flex items-center gap-2" key={item.id}>
                      <HelpLabel
                        helpKey="simulation.selection"
                        className="min-w-0 flex-1 text-sm"
                      >
                        <input
                          checked={selectedProducts.has(item.id)}
                          className="mr-2"
                          name="productIds"
                          onChange={() =>
                            setSelectedProducts((current) =>
                              toggleSet(current, item.id),
                            )
                          }
                          type="checkbox"
                          value={item.id}
                        />
                        {item.nome}
                      </HelpLabel>
                      <button
                        aria-label={`${favoriteProducts.has(item.id) ? 'Desfavoritar' : 'Favoritar'} produto ${item.nome}`}
                        onClick={() =>
                          void toggleCatalogFavorite('PRODUCT', item.id)
                        }
                        type="button"
                      >
                        <Star
                          className={`h-4 w-4 ${favoriteProducts.has(item.id) ? 'fill-amber-400 text-amber-500' : 'text-[var(--color-muted)]'}`}
                        />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[var(--color-muted)]">
                    Nenhum produto cadastrado na categoria.
                  </p>
                )}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-sm font-semibold">Grupos</legend>
              <div className="mt-3 max-h-44 space-y-2 overflow-auto rounded-xl border p-3">
                {filteredGroups.length ? (
                  filteredGroups.map((item) => (
                    <HelpLabel
                      helpKey="simulation.selection"
                      className="block text-sm"
                      key={item.id}
                    >
                      <input
                        checked={selectedGroups.has(item.id)}
                        className="mr-2"
                        name="groupIds"
                        onChange={() =>
                          setSelectedGroups((current) =>
                            toggleSet(current, item.id),
                          )
                        }
                        type="checkbox"
                        value={item.id}
                      />
                      {item.codigo}
                    </HelpLabel>
                  ))
                ) : (
                  <p className="text-sm text-[var(--color-muted)]">
                    Nenhum grupo compatível.
                  </p>
                )}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-sm font-semibold">Cotas</legend>
              <div className="mt-3 max-h-44 space-y-2 overflow-auto rounded-xl border p-3">
                {filteredQuotas.length ? (
                  filteredQuotas.map((item) => (
                    <HelpLabel
                      helpKey="simulation.selection"
                      className="block text-sm"
                      key={item.id}
                    >
                      <input
                        checked={selectedQuotas.has(item.id)}
                        className="mr-2"
                        name="quotaIds"
                        onChange={() =>
                          setSelectedQuotas((current) =>
                            toggleSet(current, item.id),
                          )
                        }
                        type="checkbox"
                        value={item.id}
                      />
                      {item.grupo.codigo} / {item.numero}
                    </HelpLabel>
                  ))
                ) : (
                  <p className="text-sm text-[var(--color-muted)]">
                    Nenhuma cota compatível.
                  </p>
                )}
              </div>
            </fieldset>
          </div>
          <div className="mt-5">
            <Field helpKey="common.notes" label="Observações">
              <textarea
                className="min-h-24 w-full rounded-xl border border-[var(--color-border-strong)] p-3 text-sm"
                maxLength={1000}
                name="notes"
                onChange={(event) => setNotes(event.target.value)}
                value={notes}
              />
            </Field>
          </div>
        </Card>
        {error ? (
          <p
            className="rounded-xl bg-red-50 p-4 text-sm text-[var(--color-danger)]"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>

      <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">Resumo da simulação</h3>
            <Badge
              tone={requestedCreditValid && termValid ? 'success' : 'warning'}
            >
              {requestedCreditValid && termValid ? 'Pronto' : 'Revisar'}
            </Badge>
          </div>
          <dl className="mt-5 space-y-3 text-sm">
            <div>
              <dt className="text-[var(--color-muted)]">Categoria</dt>
              <dd className="font-semibold">{selectedCategory}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Crédito</dt>
              <dd className="font-semibold">{moneyLabel(requestedCredit)}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Modo</dt>
              <dd className="font-semibold">
                {creditMode === 'NET_CREDIT'
                  ? 'Crédito líquido'
                  : creditMode === 'CATEGORY_VALUE'
                    ? 'Valor da categoria'
                    : 'Crédito contratado'}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Prazo</dt>
              <dd className="font-semibold">
                {desiredTermMonths || '-'} meses
              </dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Lances</dt>
              <dd className="font-semibold">
                {moneyLabel(ownBidAmount)} + {embeddedBidPercent || '0'}%
                embutido
              </dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Cliente</dt>
              <dd className="font-semibold">
                {selectedLead?.nome ?? 'Sem vínculo'}
              </dd>
            </div>
          </dl>
          <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-[var(--color-primary-soft)] p-3">
              <p className="text-xs text-[var(--color-muted)]">Admins</p>
              <p className="font-semibold">{selectedAdministrators.size}</p>
            </div>
            <div className="rounded-xl bg-[var(--color-primary-soft)] p-3">
              <p className="text-xs text-[var(--color-muted)]">Produtos</p>
              <p className="font-semibold">{selectedProducts.size}</p>
            </div>
            <div className="rounded-xl bg-[var(--color-primary-soft)] p-3">
              <p className="text-xs text-[var(--color-muted)]">Grupos</p>
              <p className="font-semibold">{selectedGroups.size}</p>
            </div>
            <div className="rounded-xl bg-[var(--color-primary-soft)] p-3">
              <p className="text-xs text-[var(--color-muted)]">Cotas</p>
              <p className="font-semibold">{selectedQuotas.size}</p>
            </div>
          </div>
        </Card>
        <div className="flex flex-col gap-3">
          <Button loading={loading} type="submit">
            <Calculator className="h-4 w-4" /> Simular
          </Button>
          <Button onClick={clear} type="button" variant="outline">
            <RotateCcw className="h-4 w-4" /> Limpar
          </Button>
        </div>
      </aside>
    </form>
  );
}
