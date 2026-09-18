'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { Field, Input } from './ui/field';

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch('/api/auth/login', {
        body: JSON.stringify({
          email: form.get('email'),
          password: form.get('password'),
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      if (!response.ok) {
        const body = (await response.json()) as {
          error?: { message?: string };
        };
        setError(body.error?.message ?? 'Não foi possível entrar');
        return;
      }
      formElement.reset();
      router.replace('/dashboard');
      router.refresh();
    } catch {
      setError('Serviço indisponível. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="mt-8 space-y-5" method="post" onSubmit={submit}>
      <Field label="Email" required>
        <Input
          autoComplete="email"
          name="email"
          placeholder="voce@empresa.com.br"
          required
          type="email"
        />
      </Field>
      <Field label="Senha" required>
        <Input
          autoComplete="current-password"
          minLength={12}
          name="password"
          required
          type="password"
        />
      </Field>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button
        className="w-full"
        disabled={!ready}
        loading={loading}
        type="submit"
      >
        {loading ? 'Entrando…' : 'Entrar'}
      </Button>
    </form>
  );
}
