'use client';

import type { AppearanceConfiguration } from '@larcarvalho/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Field, Input } from './ui/field';

// Brand metadata keeps the existing endpoint; colors live in the independent theme editor.
export function AppearanceConfigurationManager({
  appearance,
}: {
  readonly appearance: AppearanceConfiguration;
}) {
  const router = useRouter();
  const [commercialName, setCommercialName] = useState(
    appearance.commercialName,
  );
  const [logoUrl, setLogoUrl] = useState(appearance.logoUrl ?? '');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    tone: 'danger' | 'success';
  } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch('/api/appearance', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ commercialName, logoUrl: logoUrl || null }),
      });
      if (!response.ok) {
        const body = (await response.json()) as {
          error?: { message?: string };
        };
        throw new Error(
          body.error?.message ?? 'Não foi possível salvar a marca.',
        );
      }
      setMessage({ text: 'Aparência salva com sucesso.', tone: 'success' });
      router.refresh();
    } catch (error) {
      setMessage({
        text:
          error instanceof Error
            ? error.message
            : 'Não foi possível salvar a marca.',
        tone: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={submit}>
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      <Card className="p-5 sm:p-7">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Marca comercial</h3>
          <Badge tone="info">versão {appearance.version}</Badge>
        </div>
        <fieldset disabled={loading} className="mt-5 grid gap-4 md:grid-cols-2">
          <Field
            helpKey="appearance.name"
            label="Nome exibido nas propostas"
            required
          >
            <Input
              name="commercialName"
              minLength={2}
              maxLength={200}
              required
              value={commercialName}
              onChange={(event) => setCommercialName(event.target.value)}
            />
          </Field>
          <Field
            helpKey="appearance.image"
            label="Logotipo"
            help="URL de uma imagem autorizada."
          >
            <Input
              name="logoUrl"
              type="url"
              maxLength={2048}
              placeholder="https://..."
              value={logoUrl}
              onChange={(event) => setLogoUrl(event.target.value)}
            />
          </Field>
        </fieldset>
        <Button className="mt-5" loading={loading} type="submit">
          Salvar marca
        </Button>
      </Card>
    </form>
  );
}
