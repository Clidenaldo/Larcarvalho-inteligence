'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from './ui/button';
import { Field, Input, Select } from './ui/field';

export function LeadCreateForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(data: FormData) {
    setBusy(true);
    setError(null);
    const payload = {
      nome: data.get('nome'),
      telefone: String(data.get('telefone') ?? '') || undefined,
      email: String(data.get('email') ?? '') || undefined,
      categoriaInteresse:
        String(data.get('categoriaInteresse') ?? '') || undefined,
      observacoes: String(data.get('observacoes') ?? '') || undefined,
    };
    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.error?.message ?? 'Não foi possível criar o lead',
        );
      }
      const lead = await response.json();
      router.push(`/dashboard/crm/leads/${lead.id}`);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível criar o lead',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-5">
      <summary className="cursor-pointer font-semibold">
        Cadastrar lead manualmente
      </summary>
      <form
        action={(data) => void submit(data)}
        className="mt-5 grid gap-4 md:grid-cols-3"
      >
        <Field helpKey="lead.name" label="Nome" required>
          <Input name="nome" required />
        </Field>
        <Field helpKey="lead.phone" label="Telefone">
          <Input name="telefone" />
        </Field>
        <Field helpKey="lead.email" label="E-mail">
          <Input name="email" type="email" />
        </Field>
        <Field helpKey="common.category" label="Categoria">
          <Select defaultValue="" name="categoriaInteresse">
            <option value="">Não informada</option>
            <option value="IMOVEL">Imóvel</option>
            <option value="AUTOMOVEL">Automóvel</option>
            <option value="MOTOCICLETA">Motocicleta</option>
            <option value="PESADOS">Pesados</option>
            <option value="SERVICOS">Serviços</option>
            <option value="OUTROS">Outros</option>
          </Select>
        </Field>
        <Field helpKey="common.notes" label="Resumo">
          <Input maxLength={500} name="observacoes" />
        </Field>
        <div className="self-end">
          <Button disabled={busy} type="submit">
            {busy ? 'Salvando…' : 'Cadastrar lead'}
          </Button>
        </div>
        {error ? (
          <p className="text-sm text-[var(--color-danger)]" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </details>
  );
}
