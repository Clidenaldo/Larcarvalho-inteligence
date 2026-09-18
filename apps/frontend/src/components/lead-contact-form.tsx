'use client';

import {
  publicLeadRequestSchema,
  type SimuladorPublicoItem,
  type SimuladorPublicoPerfil,
} from '@larcarvalho/shared';
import { useState } from 'react';
import { Button } from './ui/button';
import { Field, Input } from './ui/field';
import { analyticsAnonymousId, trackPublicEvent } from '../lib/analytics';

interface Props {
  apiBaseUrl: string;
  perfil: SimuladorPublicoPerfil;
  interesse?: SimuladorPublicoItem;
  privacyPolicyUrl: string | null;
  whatsappNumber: string | null;
}

export function LeadContactForm({
  apiBaseUrl,
  perfil,
  interesse,
  privacyPolicyUrl,
  whatsappNumber,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(form: FormData) {
    setError(null);
    const payload = publicLeadRequestSchema.safeParse({
      nome: form.get('nome'),
      telefone: String(form.get('telefone') ?? '') || undefined,
      email: String(form.get('email') ?? '') || undefined,
      website: String(form.get('website') ?? '') || undefined,
      analyticsAnonymousId: analyticsAnonymousId(),
      consentimento: form.get('consentimento') === 'on',
      versaoTextoConsentimento: '2026-09-02.v1',
      categoriaInteresse: perfil.categoria,
      valorCreditoDesejado: perfil.valorCreditoDesejado,
      parcelaMaxima: perfil.parcelaMaxima,
      prazoMaximo: perfil.prazoMaximo,
      lanceDisponivelPercentual: perfil.lanceDisponivelPercentual,
      ...(interesse
        ? {
            interesse: {
              administradora: interesse.administradora,
              grupo: interesse.grupo,
              indiceAderenciaCapturado: interesse.indiceAderencia,
              coberturaAvaliacaoCapturada: interesse.coberturaAvaliacao,
            },
          }
        : {}),
    });
    if (!payload.success) {
      setError('Revise seu nome, contato e consentimento.');
      return;
    }
    setLoading(true);
    trackPublicEvent('LEAD_FORM_SUBMITTED', {
      path: window.location.pathname,
      category: perfil.categoria,
    });
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/public/leads`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload.data),
      });
      if (!response.ok) throw new Error();
      setSuccess(true);
    } catch {
      setError('Não foi possível enviar agora. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  if (success)
    return (
      <div
        className="mt-5 rounded-xl bg-indigo-50 p-4 text-sm font-medium text-indigo-900"
        role="status"
      >
        <p>
          Recebemos sua solicitação. Nossa equipe poderá entrar em contato pelos
          dados informados.
        </p>
        {whatsappNumber ? (
          <a
            className="mt-4 inline-flex rounded-lg public-button-primary px-4 py-2 text-sm font-bold"
            href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent('Olá! Fiz uma simulação no site da Larcarvalho Consórcios e gostaria de receber atendimento.')}`}
            onClick={() =>
              trackPublicEvent('WHATSAPP_CLICKED', {
                path: window.location.pathname,
                category: perfil.categoria,
              })
            }
            rel="noopener noreferrer"
            target="_blank"
          >
            Falar pelo WhatsApp
          </a>
        ) : null}
      </div>
    );
  if (!open)
    return (
      <Button
        className="mt-5 w-full"
        onClick={() => {
          setOpen(true);
          trackPublicEvent('LEAD_FORM_OPENED', {
            path: window.location.pathname,
            category: perfil.categoria,
          });
        }}
      >
        Quero falar com um especialista
      </Button>
    );
  return (
    <form
      action={(data) => void submit(data)}
      className="mt-5 space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4"
      noValidate
    >
      <h4 className="font-semibold">Solicitar contato</h4>
      <p className="text-xs text-[var(--color-muted)]">
        Informe seu nome e pelo menos um meio de contato.
      </p>
      <Field label="Nome" required>
        <Input autoComplete="name" maxLength={120} name="nome" required />
      </Field>
      <Field label="WhatsApp ou telefone">
        <Input autoComplete="tel" inputMode="tel" name="telefone" />
      </Field>
      <Field label="E-mail">
        <Input
          autoComplete="email"
          inputMode="email"
          name="email"
          type="email"
        />
      </Field>
      <div
        aria-hidden="true"
        className="absolute -left-[10000px] h-px w-px overflow-hidden"
      >
        <label>
          Website
          <input autoComplete="off" name="website" tabIndex={-1} />
        </label>
      </div>
      <label className="flex items-start gap-3 text-xs leading-5">
        <input className="mt-1" name="consentimento" required type="checkbox" />
        Autorizo o uso dos dados informados para que a Larcarvalho Consórcios
        entre em contato sobre esta solicitação.
      </label>
      {privacyPolicyUrl ? (
        <a
          className="block text-xs font-semibold text-[var(--color-primary)] underline"
          href={privacyPolicyUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          Política de Privacidade
        </a>
      ) : null}
      {error ? (
        <p className="text-sm text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button disabled={loading} type="submit">
          {loading ? 'Enviando…' : 'Enviar solicitação'}
        </Button>
        <Button
          disabled={loading}
          onClick={() => setOpen(false)}
          type="button"
          variant="ghost"
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
