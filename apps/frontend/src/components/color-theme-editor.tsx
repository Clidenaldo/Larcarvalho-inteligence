'use client';
import { HelpLabel, FieldHelp } from './ui/field-help';

import { useState } from 'react';
import { hexColorSchema } from '@larcarvalho/shared';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input, Select } from './ui/field';
import { Modal } from './ui/modal';
interface ThemeEditorProps<T extends Record<string, string>> {
  theme: T;
  defaults: T;
  fields: ReadonlyArray<readonly [keyof T, string]>;
  presets: Readonly<Record<string, T>>;
  parse: (value: unknown) => T;
  contrastChecks: (theme: T) => Array<{ label: string; ratio: number | null }>;
  area: 'public' | 'admin';
  previewModes: readonly string[];
  renderPreview: (theme: T, mode: string) => ReactNode;
}

export function ColorThemeEditor<T extends Record<string, string>>({
  theme,
  defaults,
  fields,
  presets,
  parse,
  contrastChecks,
  area,
  previewModes,
  renderPreview,
}: ThemeEditorProps<T>) {
  const router = useRouter();
  const publicArea = area === 'public';
  const areaLabel = publicArea ? 'público' : 'administrativo';
  const [resetPending, setResetPending] = useState(false);
  const [draft, setDraft] = useState<T>({ ...theme });
  const [saved, setSaved] = useState<T>({ ...theme });
  const [preset, setPreset] = useState('Personalizado');
  const [mode, setMode] = useState(previewModes[0] ?? '');
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: 'danger' | 'success';
    text: string;
  } | null>(null);
  const dirty = fields.some(([key]) => draft[key] !== saved[key]);
  const contrast = contrastChecks(draft);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let parsed: T;
    try {
      parsed = parse(draft);
    } catch {
      setFeedback({
        tone: 'danger',
        text: 'Revise as cores: use o formato #RRGGBB.',
      });
      return;
    }
    setLoading(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/appearance/${area}-theme${resetPending ? '/reset' : ''}`,
        {
          method: resetPending ? 'POST' : 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(resetPending ? {} : parsed),
        },
      );
      if (!response.ok) {
        const body = (await response.json()) as {
          error?: { message?: string };
        };
        throw new Error(
          body.error?.message ?? `Não foi possível salvar o tema ${areaLabel}.`,
        );
      }
      const persisted = parse(await response.json());
      setDraft(persisted);
      setSaved(persisted);
      setResetPending(false);
      if (!publicArea) router.refresh();
      setFeedback({
        tone: 'success',
        text: `Tema ${areaLabel} salvo. Atualize as páginas desta área para ver as novas cores.`,
      });
    } catch (error) {
      setFeedback({
        tone: 'danger',
        text:
          error instanceof Error
            ? error.message
            : `Não foi possível salvar o tema ${areaLabel}.`,
      });
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--color-muted)]">
        {publicArea
          ? 'Personalize as páginas que seus visitantes acessam.'
          : 'Personalize o painel administrativo.'}{' '}
        Cada área tem suas próprias cores.
      </p>
      {feedback ? <Alert tone={feedback.tone}>{feedback.text}</Alert> : null}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <form
          onSubmit={(event) => void save(event)}
          className="min-w-0 space-y-5"
        >
          <Card className="p-5">
            <HelpLabel
              helpKey="appearance.preset"
              className="block text-sm font-semibold"
            >
              Preset de cores
              <Select
                className="mt-2"
                disabled={loading}
                value={preset}
                onChange={(event) => {
                  const name = event.target.value;
                  setPreset(name);
                  setResetPending(false);
                  setFeedback(null);
                  const selected = presets[name];
                  if (selected) setDraft({ ...selected });
                }}
              >
                {Object.keys(presets).map((name) => (
                  <option key={name}>{name}</option>
                ))}
                <option>Personalizado</option>
              </Select>
            </HelpLabel>
            <fieldset
              disabled={loading}
              className="mt-5 grid gap-4 sm:grid-cols-2"
            >
              <legend className="sr-only">Cores do tema {areaLabel}</legend>
              {fields.map(([key, label]) => (
                <div key={String(key)}>
                  <div className="flex flex-wrap items-center gap-1">
                    <label
                      htmlFor={`${area}-${String(key)}`}
                      className="text-sm font-medium"
                    >
                      {label}
                    </label>
                    <FieldHelp
                      helpKey="appearance.color"
                      label={`${label} ${areaLabel}`}
                    />
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input
                      aria-label={`${label} seletor ${areaLabel}`}
                      type="color"
                      className="h-11 w-14 shrink-0 rounded-lg border border-[var(--color-border)] p-1"
                      value={
                        hexColorSchema.safeParse(draft[key]).success
                          ? draft[key]
                          : defaults[key]
                      }
                      onChange={(event) => {
                        setDraft({ ...draft, [key]: event.target.value });
                        setPreset('Personalizado');
                        setResetPending(false);
                        setFeedback(null);
                      }}
                    />
                    <Input
                      id={`${area}-${String(key)}`}
                      name={String(key)}
                      aria-label={`${label} HEX ${areaLabel}`}
                      required
                      pattern="#[0-9a-fA-F]{6}"
                      maxLength={7}
                      className="min-w-0 font-mono"
                      value={draft[key]}
                      onChange={(event) => {
                        setDraft({ ...draft, [key]: event.target.value });
                        setPreset('Personalizado');
                        setResetPending(false);
                        setFeedback(null);
                      }}
                    />
                  </div>
                </div>
              ))}
            </fieldset>
          </Card>
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <p
              aria-live="polite"
              className="mr-auto text-xs text-[var(--color-muted)]"
            >
              {dirty
                ? 'Alterações ainda não salvas'
                : 'Nenhuma alteração pendente'}
            </p>
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => setRestoreOpen(true)}
            >
              {publicArea
                ? 'Restaurar cores padrão'
                : 'Restaurar padrão do Painel Administrativo'}
            </Button>
            <Button loading={loading} type="submit">
              {publicArea
                ? 'Salvar alterações'
                : 'Salvar Painel Administrativo'}
            </Button>
          </div>
        </form>
        <aside className="min-w-0 space-y-4 xl:sticky xl:top-24">
          <h3 className="font-semibold">
            {publicArea
              ? 'Preview da área pública'
              : 'Preview do painel administrativo'}
          </h3>
          <div aria-label="Tipo de preview" className="flex flex-wrap gap-2">
            {previewModes.map((value) => (
              <Button
                key={value}
                aria-pressed={mode === value}
                variant={mode === value ? 'primary' : 'outline'}
                onClick={() => setMode(value)}
              >
                {value}
              </Button>
            ))}
          </div>
          {renderPreview(draft, mode)}
          <p className="text-xs text-[var(--color-muted)]">
            Preview visual. As cores só serão publicadas ao salvar alterações.
          </p>
          <details
            className="rounded-xl border border-[var(--color-border)] p-4"
            open={contrast.some(
              (check) => check.ratio !== null && check.ratio < 4.5,
            )}
          >
            <summary className="text-sm font-semibold">
              Contraste e legibilidade
            </summary>
            <p className="my-2 text-xs text-[var(--color-muted)]">
              Avisos orientativos, sem bloquear o salvamento.
            </p>
            {contrast.map((check) => (
              <p className="mt-2 text-xs" key={check.label}>
                {check.label}:{' '}
                {check.ratio === null
                  ? 'Informe cores válidas'
                  : `${check.ratio.toFixed(2)}:1 — ${check.ratio < 4.5 ? 'Contraste insuficiente para boa legibilidade' : 'AA'}`}
              </p>
            ))}
          </details>
        </aside>
      </div>
      <Modal
        open={restoreOpen}
        onClose={() => setRestoreOpen(false)}
        title="Restaurar cores padrão"
        description={`Restaurar a identidade visual padrão do tema ${areaLabel}?`}
      >
        <p className="text-sm">
          O preview receberá as cores padrão. Salve este tema para publicá-las.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setRestoreOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              setDraft({ ...defaults });
              setPreset(Object.keys(presets)[0] ?? 'Personalizado');
              setResetPending(true);
              setFeedback(null);
              setRestoreOpen(false);
            }}
          >
            Restaurar padrão
          </Button>
        </div>
      </Modal>
    </div>
  );
}
