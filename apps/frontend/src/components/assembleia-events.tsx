'use client';
import type { AuthResponse, Contemplacao, Lance } from '@larcarvalho/shared';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { formatBrl } from '../lib/formatters';
import { Alert } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Field, Input, Select } from './ui/field';
import { Modal } from './ui/modal';
type Cota = { id: string; numero: string };
async function send(path: string, body: unknown) {
  const r = await fetch(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  if (!r.ok) {
    const p = (await r.json()) as { error?: { message?: string } };
    throw new Error(p.error?.message ?? 'Não foi possível concluir');
  }
}
export function AssembleiaEvents({
  assembleiaId,
  lances,
  contemplacoes,
  cotas,
  identity,
}: {
  assembleiaId: string;
  lances: Lance[];
  contemplacoes: Contemplacao[];
  cotas: Cota[];
  identity: AuthResponse;
}) {
  const router = useRouter(),
    [modal, setModal] = useState<'lance' | 'contemplacao' | null>(null),
    [feedback, setFeedback] = useState<string | null>(null),
    [pending, setPending] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      body = Object.fromEntries(
        [...f.entries()].map(([k, v]) => [k, v === '' ? undefined : v]),
      );
    Object.assign(body, {
      assembleiaId,
      ...(modal === 'lance'
        ? { contemplado: f.get('contemplado') === 'true' }
        : {}),
    });
    setPending(true);
    try {
      await send(
        `/api/${modal === 'lance' ? 'lances' : 'contemplacoes'}`,
        body,
      );
      setModal(null);
      setFeedback('Registro histórico salvo.');
      router.refresh();
    } catch (x) {
      setFeedback(x instanceof Error ? x.message : 'Falha ao salvar');
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      {feedback ? (
        <div className="xl:col-span-2">
          <Alert tone="success">{feedback}</Alert>
        </div>
      ) : null}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b p-5">
          <h2 className="font-semibold">Lances</h2>
          {identity.permissions.includes('lances.create') ? (
            <Button onClick={() => setModal('lance')}>
              <Plus className="h-4 w-4" />
              Novo lance
            </Button>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[38rem] text-left text-sm">
            <thead>
              <tr>
                <th className="p-3">Cota</th>
                <th>Tipo</th>
                <th>Percentual</th>
                <th>Valor</th>
                <th>Resultado</th>
                <th>Origem</th>
              </tr>
            </thead>
            <tbody>
              {lances.map((l) => (
                <tr className="border-t" key={l.id}>
                  <td className="p-3">
                    {l.cota?.numero ?? 'Não identificada'}
                  </td>
                  <td>{l.tipo}</td>
                  <td>{l.percentual ? `${l.percentual}%` : '—'}</td>
                  <td>{l.valor ? formatBrl(Number(l.valor)) : '—'}</td>
                  <td>
                    <Badge tone={l.contemplado ? 'success' : 'neutral'}>
                      {l.contemplado ? 'Contemplado' : 'Não contemplado'}
                    </Badge>
                  </td>
                  <td>{l.origem}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {lances.length === 0 ? (
            <p className="p-5 text-sm text-[var(--color-muted)]">
              Nenhum lance registrado.
            </p>
          ) : null}
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b p-5">
          <h2 className="font-semibold">Contemplações</h2>
          {identity.permissions.includes('contemplacoes.create') ? (
            <Button onClick={() => setModal('contemplacao')}>
              <Plus className="h-4 w-4" />
              Nova contemplação
            </Button>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead>
              <tr>
                <th className="p-3">Cota</th>
                <th>Tipo</th>
                <th>Percentual</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {contemplacoes.map((c) => (
                <tr className="border-t" key={c.id}>
                  <td className="p-3">
                    {c.cota?.numero ?? 'Não identificada'}
                  </td>
                  <td>
                    <Badge tone="info">{c.tipo}</Badge>
                  </td>
                  <td>{c.percentualLance ? `${c.percentualLance}%` : '—'}</td>
                  <td>
                    {c.valorLance ? formatBrl(Number(c.valorLance)) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {contemplacoes.length === 0 ? (
            <p className="p-5 text-sm text-[var(--color-muted)]">
              Nenhuma contemplação registrada.
            </p>
          ) : null}
        </div>
      </Card>
      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === 'lance' ? 'Novo lance' : 'Nova contemplação'}
      >
        <form className="space-y-4" onSubmit={save}>
          <Field helpKey="assembly.quota" label="Cota">
            <Select name="cotaId">
              <option value="">Não identificada</option>
              {cotas.map((c) => (
                <option key={c.id} value={c.id}>
                  Cota {c.numero}
                </option>
              ))}
            </Select>
          </Field>
          {modal === 'lance' ? (
            <>
              <Field helpKey="bid.type" label="Tipo" required>
                <Select name="tipo">
                  <option>LIVRE</option>
                  <option>FIXO</option>
                  <option>EMBUTIDO</option>
                  <option>OUTRO</option>
                </Select>
              </Field>
              <Field helpKey="bid.percent" label="Percentual">
                <Input
                  min="0"
                  name="percentual"
                  step="0.000001"
                  type="number"
                />
              </Field>
              <Field helpKey="bid.amount" label="Valor">
                <Input min="0" name="valor" step="0.01" type="number" />
              </Field>
              <Field helpKey="bid.result" label="Resultado">
                <Select name="contemplado">
                  <option value="false">Não contemplado</option>
                  <option value="true">Contemplado</option>
                </Select>
              </Field>
              <Field helpKey="bid.origin" label="Origem" required>
                <Select name="origem">
                  <option>MANUAL</option>
                  <option>IMPORTACAO</option>
                  <option>INTEGRACAO</option>
                  <option>PUBLICO</option>
                  <option>OUTRO</option>
                </Select>
              </Field>
            </>
          ) : (
            <>
              <Field helpKey="award.type" label="Tipo" required>
                <Select name="tipo">
                  <option>SORTEIO</option>
                  <option>LANCE</option>
                  <option>OUTRO</option>
                </Select>
              </Field>
              <Field helpKey="common.externalCode" label="Código externo">
                <Input name="codigoExterno" />
              </Field>
              <Field helpKey="bid.percent" label="Percentual do lance">
                <Input
                  min="0"
                  name="percentualLance"
                  step="0.000001"
                  type="number"
                />
              </Field>
              <Field helpKey="bid.amount" label="Valor do lance">
                <Input min="0" name="valorLance" step="0.01" type="number" />
              </Field>
            </>
          )}
          <div className="flex justify-end gap-3">
            <Button onClick={() => setModal(null)} variant="ghost">
              Cancelar
            </Button>
            <Button loading={pending} type="submit">
              Salvar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
