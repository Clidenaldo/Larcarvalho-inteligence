'use client';
import { HelpLabel } from './ui/field-help';

import type { MyAccount } from '@larcarvalho/shared';
import { Mail, Save, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { roleLabels } from '../lib/identity';
import { ChangePasswordForm } from './change-password-form';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Field, Input, Select } from './ui/field';

async function errorMessage(response: Response) {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string };
    };
    return payload.error?.message ?? 'Não foi possível salvar sua conta.';
  } catch {
    return 'Não foi possível salvar sua conta.';
  }
}

export function MyAccountManager({ account }: { readonly account: MyAccount }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    tone: 'danger' | 'success';
  } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nome: data.get('nome'),
          telefoneWhatsapp: data.get('telefoneWhatsapp'),
          fotoUrl: data.get('fotoUrl'),
          interfacePreferences: {
            density: data.get('density'),
            reducedMotion: data.get('reducedMotion') === 'on',
            theme: data.get('theme'),
          },
        }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      setMessage({ text: 'Conta atualizada com sucesso.', tone: 'success' });
      router.refresh();
    } catch (error) {
      setMessage({
        text:
          error instanceof Error
            ? error.message
            : 'Não foi possível salvar sua conta.',
        tone: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="space-y-6">
        {message ? (
          <p
            className={`rounded-xl p-4 text-sm ${message.tone === 'success' ? 'bg-indigo-50 text-indigo-900' : 'bg-red-50 text-[var(--color-danger)]'}`}
            role={message.tone === 'success' ? 'status' : 'alert'}
          >
            {message.text}
          </p>
        ) : null}
        <Card className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-full bg-[var(--color-primary-soft)] text-lg font-bold text-[var(--color-primary)]">
                {account.fotoUrl ? (
                  <img
                    alt=""
                    className="h-full w-full object-cover"
                    src={account.fotoUrl}
                  />
                ) : (
                  account.nome.charAt(0).toUpperCase()
                )}
              </div>
              <div>
                <h3 className="font-semibold">{account.nome}</h3>
                <p className="text-sm text-[var(--color-muted)]">
                  {roleLabels[account.role]}
                </p>
              </div>
            </div>
            <Badge tone="success">Conta ativa</Badge>
          </div>
          <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={submit}>
            <Field helpKey="user.name" label="Nome" required>
              <Input
                defaultValue={account.nome}
                maxLength={200}
                name="nome"
                required
              />
            </Field>
            <Field
              helpKey="user.email"
              help={
                account.emailManaged
                  ? 'Controlado pelo administrador.'
                  : 'E-mail da sua conta.'
              }
              label="E-mail"
            >
              <Input
                defaultValue={account.email}
                name="email"
                readOnly
                type="email"
              />
            </Field>
            <Field helpKey="user.phone" label="Telefone/WhatsApp">
              <Input
                defaultValue={account.telefoneWhatsapp ?? ''}
                maxLength={30}
                name="telefoneWhatsapp"
                placeholder="+55 85 99999-9999"
              />
            </Field>
            <Field
              helpKey="appearance.image"
              help="URL de imagem autorizada."
              label="Foto opcional"
            >
              <Input
                defaultValue={account.fotoUrl ?? ''}
                name="fotoUrl"
                placeholder="https://..."
                type="url"
              />
            </Field>
            <Field helpKey="appearance.theme" label="Tema">
              <Select
                defaultValue={account.interfacePreferences.theme}
                name="theme"
              >
                <option value="light">Claro</option>
                <option value="dark">Escuro</option>
                <option value="system">Sistema</option>
              </Select>
            </Field>
            <Field helpKey="appearance.density" label="Densidade">
              <Select
                defaultValue={account.interfacePreferences.density}
                name="density"
              >
                <option value="comfortable">Confortável</option>
                <option value="compact">Compacta</option>
              </Select>
            </Field>
            <HelpLabel
              helpKey="appearance.motion"
              className="flex min-h-11 items-center gap-3 self-end rounded-xl border border-[var(--color-border)] px-4 text-sm font-medium"
            >
              <input
                defaultChecked={account.interfacePreferences.reducedMotion}
                name="reducedMotion"
                type="checkbox"
              />{' '}
              Reduzir movimento
            </HelpLabel>
            <div className="md:col-span-2">
              <Button loading={loading} type="submit">
                <Save className="h-4 w-4" /> Salvar minha conta
              </Button>
            </div>
          </form>
        </Card>
        <Card className="p-5 sm:p-7">
          <h3 className="font-semibold">Segurança</h3>
          <p className="mt-1 text-sm leading-6 text-[var(--color-muted)]">
            Ao alterar sua senha, todas as outras sessões serão revogadas.
          </p>
          <div className="mt-6">
            <ChangePasswordForm />
          </div>
        </Card>
      </div>
      <aside className="space-y-6">
        <Card className="p-5">
          <div className="flex gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
              <Mail className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">Dados visíveis</p>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                Esta tela mostra apenas informações da sua própria conta.
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <UserRound className="h-5 w-5 text-[var(--color-primary)]" />
            <h3 className="font-semibold">Atividade recente</h3>
          </div>
          <div className="mt-4 space-y-3">
            {account.activity.length ? (
              account.activity.map((item) => (
                <div
                  className="rounded-xl border border-[var(--color-border)] p-3 text-sm"
                  key={`${item.action}-${item.createdAt}`}
                >
                  <p className="font-semibold">{item.action}</p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {item.entity} ·{' '}
                    {new Date(item.createdAt).toLocaleString('pt-BR')}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-[var(--color-muted)]">
                Nenhuma atividade recente registrada.
              </p>
            )}
          </div>
        </Card>
      </aside>
    </div>
  );
}
