'use client';
import { HelpLabel } from './ui/field-help';

import type {
  Administradora,
  CommercialConfiguration,
  ProductCommercialRule,
  Produto,
} from '@larcarvalho/shared';
import { Save, Settings2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Field, Input, Select } from './ui/field';

async function mutation(path: string, method: string, body: unknown) {
  const response = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = (await response.json()) as { error?: { message?: string } };
    throw new Error(payload.error?.message ?? 'Operação não concluída');
  }
  return response;
}

export function CommercialConfigurationManager({
  configuration,
  rules,
  administrators,
  products,
  canManageConfiguration,
  canManageRules,
}: {
  readonly configuration: CommercialConfiguration;
  readonly rules: ProductCommercialRule[];
  readonly administrators: Administradora[];
  readonly products: Produto[];
  readonly canManageConfiguration: boolean;
  readonly canManageRules: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const run = async (operation: () => Promise<unknown>) => {
    setLoading(true);
    setMessage(null);
    try {
      await operation();
      setMessage('Alteração salva com sucesso.');
      router.refresh();
    } catch (problem) {
      setMessage(
        problem instanceof Error ? problem.message : 'Falha inesperada',
      );
    } finally {
      setLoading(false);
    }
  };
  const saveConfiguration = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run(() =>
      mutation('/api/commercial-configurations', 'PATCH', {
        organizationName: data.get('organizationName'),
        roundingMode: data.get('roundingMode'),
        proposalValidityDays: Number(data.get('proposalValidityDays')),
        ruleVersionPrefix: data.get('ruleVersionPrefix'),
        requiredDisclaimer: data.get('requiredDisclaimer'),
      }),
    );
  };
  const createRule = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const optional = (name: string) =>
      data.get(name) === '' ? null : data.get(name);
    void run(() =>
      mutation('/api/product-commercial-rules', 'POST', {
        administradoraId: data.get('administradoraId'),
        ...(data.get('produtoId') ? { produtoId: data.get('produtoId') } : {}),
        category: data.get('category'),
        name: data.get('name'),
        validFrom: new Date(String(data.get('validFrom'))).toISOString(),
        administrationFeePercent: optional('administrationFeePercent'),
        reserveFundPercent: optional('reserveFundPercent'),
        insurancePercent: optional('insurancePercent'),
        adhesionFeePercent: optional('adhesionFeePercent'),
        maxEmbeddedBidPercent: optional('maxEmbeddedBidPercent'),
        embeddedBidBasis: data.get('embeddedBidBasis'),
        minimumTermMonths: data.get('minimumTermMonths')
          ? Number(data.get('minimumTermMonths'))
          : null,
        maximumTermMonths: data.get('maximumTermMonths')
          ? Number(data.get('maximumTermMonths'))
          : null,
        reducedInstallmentPercent: optional('reducedInstallmentPercent'),
        reducedUntilContemplation:
          data.get('reducedUntilContemplation') === 'on',
        diluteReducedInstallments:
          data.get('diluteReducedInstallments') === 'on',
        categoryValueCreditRatio: optional('categoryValueCreditRatio'),
        bidType: data.get('bidType'),
        ownBidMaxPercent: optional('ownBidMaxPercent'),
        inProgressAllowed: data.get('inProgressAllowed') === 'on',
        structuredOperationEligible:
          data.get('structuredOperationEligible') === 'on',
        notes: optional('notes'),
      }),
    );
  };
  return (
    <div className="space-y-7">
      {message ? (
        <p
          className="rounded-xl bg-indigo-50 p-4 text-sm text-indigo-900"
          role="status"
        >
          {message}
        </p>
      ) : null}
      <Card className="p-5 sm:p-7">
        <div className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-[var(--color-primary)]" />
          <h3 className="text-lg font-semibold">Configuração geral</h3>
          <Badge tone="info">versão {configuration.version}</Badge>
        </div>
        <form
          className="mt-5 grid gap-4 md:grid-cols-2"
          onSubmit={saveConfiguration}
        >
          <Field helpKey="config.organization" label="Nome da organização">
            <Input
              defaultValue={configuration.organizationName}
              disabled={!canManageConfiguration}
              name="organizationName"
              required
            />
          </Field>
          <Field helpKey="config.rounding" label="Arredondamento">
            <Select
              defaultValue={configuration.roundingMode}
              disabled={!canManageConfiguration}
              name="roundingMode"
            >
              <option value="HALF_UP">Metade para cima</option>
              <option value="UP">Sempre para cima</option>
              <option value="DOWN">Sempre para baixo</option>
            </Select>
          </Field>
          <Field helpKey="config.validity" label="Validade padrão da proposta">
            <Input
              defaultValue={configuration.proposalValidityDays}
              disabled={!canManageConfiguration}
              min="1"
              max="365"
              name="proposalValidityDays"
              type="number"
            />
          </Field>
          <Field helpKey="config.prefix" label="Prefixo da regra">
            <Input
              defaultValue={configuration.ruleVersionPrefix}
              disabled={!canManageConfiguration}
              maxLength={20}
              name="ruleVersionPrefix"
            />
          </Field>
          <div className="md:col-span-2">
            <Field helpKey="config.disclaimer" label="Aviso obrigatório">
              <textarea
                className="min-h-24 w-full rounded-xl border p-3 text-sm"
                defaultValue={configuration.requiredDisclaimer}
                disabled={!canManageConfiguration}
                maxLength={1000}
                name="requiredDisclaimer"
              />
            </Field>
          </div>
          {canManageConfiguration ? (
            <Button className="w-fit" loading={loading} type="submit">
              <Save className="h-4 w-4" /> Salvar configuração
            </Button>
          ) : null}
        </form>
      </Card>
      {canManageRules ? (
        <Card className="p-5 sm:p-7">
          <h3 className="text-lg font-semibold">Nova regra comercial</h3>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Campos financeiros vazios produzem INCOMPLETE_DATA; use zero quando
            a cobrança não existir.
          </p>
          <form
            className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4"
            onSubmit={createRule}
          >
            <Field
              helpKey="common.administrator"
              label="Administradora"
              required
            >
              <Select name="administradoraId" required>
                <option value="">Selecione</option>
                {administrators.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <Field helpKey="rule.product" label="Produto">
              <Select name="produtoId">
                <option value="">Regra por categoria</option>
                {products.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <Field helpKey="common.category" label="Categoria" required>
              <Select name="category">
                <option value="IMOVEL">Imóvel</option>
                <option value="AUTOMOVEL">Automóvel</option>
                <option value="MOTOCICLETA">Moto</option>
                <option value="PESADOS">Pesados</option>
                <option value="SERVICOS">Serviços</option>
                <option value="OUTROS">Outros</option>
              </Select>
            </Field>
            <Field helpKey="rule.name" label="Nome da regra" required>
              <Input name="name" required />
            </Field>
            <Field helpKey="rule.start" label="Início da vigência" required>
              <Input
                defaultValue={new Date().toISOString().slice(0, 10)}
                name="validFrom"
                required
                type="date"
              />
            </Field>
            <Field helpKey="fees.admin" label="Taxa administrativa (%)">
              <Input
                min="0"
                max="100"
                name="administrationFeePercent"
                step="0.000001"
                type="number"
              />
            </Field>
            <Field helpKey="fees.reserve" label="Fundo de reserva (%)">
              <Input
                min="0"
                max="100"
                name="reserveFundPercent"
                step="0.000001"
                type="number"
              />
            </Field>
            <Field helpKey="fees.insurance" label="Seguro (%)">
              <Input
                min="0"
                max="100"
                name="insurancePercent"
                step="0.000001"
                type="number"
              />
            </Field>
            <Field helpKey="fees.adhesion" label="Taxa de adesão (%)">
              <Input
                min="0"
                max="100"
                name="adhesionFeePercent"
                step="0.000001"
                type="number"
              />
            </Field>
            <Field helpKey="rule.embeddedMax" label="Máximo lance embutido (%)">
              <Input
                min="0"
                max="100"
                name="maxEmbeddedBidPercent"
                step="0.000001"
                type="number"
              />
            </Field>
            <Field helpKey="rule.embeddedBasis" label="Base do lance embutido">
              <Select name="embeddedBidBasis" defaultValue="CONTRACTED_CREDIT">
                <option value="CONTRACTED_CREDIT">Crédito contratado</option>
                <option value="PLAN_TOTAL">Total do plano</option>
              </Select>
            </Field>
            <Field helpKey="rule.bidType" label="Tipo de lance próprio">
              <Select name="bidType" defaultValue="FREE">
                <option value="FREE">Livre</option>
                <option value="FIXED">Fixo (assembleia)</option>
                <option value="PERCENTUAL">Percentual limitado</option>
              </Select>
            </Field>
            <Field helpKey="rule.ownMax" label="Máximo lance próprio (%)">
              <Input
                min="0"
                max="100"
                name="ownBidMaxPercent"
                step="0.000001"
                type="number"
              />
            </Field>
            <Field
              helpKey="rule.ratio"
              label="Proporção crédito/valor categoria (%)"
            >
              <Input
                min="0"
                max="100"
                name="categoryValueCreditRatio"
                step="0.000001"
                type="number"
              />
            </Field>
            <Field helpKey="rule.minTerm" label="Prazo mínimo">
              <Input
                min="1"
                max="1200"
                name="minimumTermMonths"
                type="number"
              />
            </Field>
            <Field helpKey="rule.maxTerm" label="Prazo máximo">
              <Input
                min="1"
                max="1200"
                name="maximumTermMonths"
                type="number"
              />
            </Field>
            <Field helpKey="rule.reduced" label="Parcela reduzida (%)">
              <Input
                min="0"
                max="100"
                name="reducedInstallmentPercent"
                step="0.000001"
                type="number"
              />
            </Field>
            <HelpLabel
              helpKey="rule.reducedUntilAward"
              className="flex items-center gap-2 text-sm"
            >
              <input name="reducedUntilContemplation" type="checkbox" />{' '}
              Reduzida até contemplação
            </HelpLabel>
            <HelpLabel
              helpKey="rule.dilute"
              className="flex items-center gap-2 text-sm"
            >
              <input name="diluteReducedInstallments" type="checkbox" /> Diluir
              desconto pós-contemplação
            </HelpLabel>
            <HelpLabel
              helpKey="rule.inProgress"
              className="flex items-center gap-2 text-sm"
            >
              <input name="inProgressAllowed" type="checkbox" /> Permite cota em
              andamento
            </HelpLabel>
            <HelpLabel
              helpKey="rule.allowStructured"
              className="flex items-center gap-2 text-sm"
            >
              <input name="structuredOperationEligible" type="checkbox" />{' '}
              Permite operação estruturada
            </HelpLabel>
            <div className="lg:col-span-4">
              <Field helpKey="common.notes" label="Observações">
                <Input name="notes" maxLength={1000} />
              </Field>
            </div>
            <Button className="w-fit" loading={loading} type="submit">
              Criar regra versionada
            </Button>
          </form>
        </Card>
      ) : null}
      <section>
        <h3 className="text-xl font-semibold">Regras e histórico de versões</h3>
        <div className="mt-4 grid gap-4">
          {rules.map((rule) => (
            <Card className="p-5" key={rule.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase text-[var(--color-primary)]">
                    {rule.administratorName} · {rule.category}
                  </p>
                  <h4 className="mt-1 font-semibold">{rule.name}</h4>
                  <p className="text-sm text-[var(--color-muted)]">
                    {rule.productName ?? 'Regra por categoria'} · versão{' '}
                    {rule.version}
                  </p>
                </div>
                <Badge tone={rule.active ? 'success' : 'neutral'}>
                  {rule.active ? 'Ativa' : 'Histórica'}
                </Badge>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
                <div>
                  <dt>Taxa adm.</dt>
                  <dd>{rule.administrationFeePercent ?? '-'}%</dd>
                </div>
                <div>
                  <dt>Reserva</dt>
                  <dd>{rule.reserveFundPercent ?? '-'}%</dd>
                </div>
                <div>
                  <dt>Seguro</dt>
                  <dd>{rule.insurancePercent ?? '-'}%</dd>
                </div>
                <div>
                  <dt>Adesão</dt>
                  <dd>{rule.adhesionFeePercent ?? '-'}%</dd>
                </div>
                <div>
                  <dt>Lance embutido</dt>
                  <dd>{rule.maxEmbeddedBidPercent ?? '-'}%</dd>
                </div>
                <div>
                  <dt>Prazo</dt>
                  <dd>
                    {rule.minimumTermMonths ?? '-'}–
                    {rule.maximumTermMonths ?? '-'}
                  </dd>
                </div>
                <div>
                  <dt>Base do lance</dt>
                  <dd>
                    {rule.embeddedBidBasis === 'PLAN_TOTAL'
                      ? 'Total do plano'
                      : 'Crédito contratado'}
                  </dd>
                </div>
                <div>
                  <dt>Tipo de lance</dt>
                  <dd>
                    {rule.bidType === 'FIXED'
                      ? 'Fixo'
                      : rule.bidType === 'PERCENTUAL'
                        ? 'Limitado'
                        : 'Livre'}
                  </dd>
                </div>
                <div>
                  <dt>Máx. lance próprio</dt>
                  <dd>{rule.ownBidMaxPercent ?? '-'}%</dd>
                </div>
                <div>
                  <dt>Crédito categoria</dt>
                  <dd>{rule.categoryValueCreditRatio ?? '-'}%</dd>
                </div>
                <div>
                  <dt>Redução</dt>
                  <dd>
                    {rule.reducedInstallmentPercent ?? '-'}%
                    {rule.diluteReducedInstallments ? ' · dilui' : ''}
                  </dd>
                </div>
              </dl>
              {canManageRules && rule.active ? (
                <div className="mt-4 border-t border-[var(--color-border)] pt-4">
                  <Button
                    disabled={loading}
                    onClick={() =>
                      void run(() =>
                        mutation(
                          `/api/product-commercial-rules/${rule.id}`,
                          'DELETE',
                          {},
                        ),
                      )
                    }
                    type="button"
                    variant="outline"
                  >
                    <Trash2 className="h-4 w-4" /> Desativar regra
                  </Button>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
