'use client';

import { KeyRound } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';

import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { Field, Input } from './ui/field';

export function ChangePasswordForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    tone: 'danger' | 'success';
  } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get('currentPassword') ?? '');
    const newPassword = String(form.get('newPassword') ?? '');
    const confirmation = String(form.get('confirmation') ?? '');
    if (newPassword !== confirmation) {
      setFeedback({
        message: 'A confirmação não corresponde à nova senha.',
        tone: 'danger',
      });
      return;
    }
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/auth/change-password', {
        body: JSON.stringify({ currentPassword, newPassword }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      if (!response.ok) {
        const payload = (await response.json()) as {
          error?: { message?: string };
        };
        throw new Error(
          payload.error?.message ?? 'Não foi possível alterar a senha',
        );
      }
      formRef.current?.reset();
      setFeedback({
        message: 'Senha alterada. Suas outras sessões foram encerradas.',
        tone: 'success',
      });
    } catch (error) {
      setFeedback({
        message:
          error instanceof Error
            ? error.message
            : 'Não foi possível alterar a senha.',
        tone: 'danger',
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit} ref={formRef}>
      {feedback ? <Alert tone={feedback.tone}>{feedback.message}</Alert> : null}
      <Field helpKey="user.currentPassword" label="Senha atual" required>
        <Input
          autoComplete="current-password"
          minLength={12}
          name="currentPassword"
          required
          type="password"
        />
      </Field>
      <Field
        helpKey="user.password"
        help="Use uma frase-senha entre 12 e 128 caracteres."
        label="Nova senha"
        required
      >
        <Input
          autoComplete="new-password"
          maxLength={128}
          minLength={12}
          name="newPassword"
          required
          type="password"
        />
      </Field>
      <Field
        helpKey="user.confirmPassword"
        label="Confirmar nova senha"
        required
      >
        <Input
          autoComplete="new-password"
          maxLength={128}
          minLength={12}
          name="confirmation"
          required
          type="password"
        />
      </Field>
      <Button loading={pending} type="submit">
        <KeyRound aria-hidden="true" className="h-4 w-4" />
        Alterar senha
      </Button>
    </form>
  );
}
