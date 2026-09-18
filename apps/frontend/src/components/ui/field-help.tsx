'use client';

import { CircleHelp, X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type LabelHTMLAttributes,
} from 'react';

import { formHelp, safeHelpUrl, type FormHelpKey } from '../../lib/form-help';
import { Button } from './button';

/** For existing checkbox/radio layouts: the help button stays outside the label. */
export function HelpLabel({
  helpKey,
  helpLabel,
  children,
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement> & {
  readonly helpKey: FormHelpKey;
  readonly helpLabel?: string;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-1">
      <label {...props} className={`min-w-0 flex-1 ${className ?? ''}`}>
        {children}
      </label>
      <FieldHelp helpKey={helpKey} label={helpLabel} />
    </div>
  );
}

/** An in-flow disclosure: never obscures the input, including inside a dialog. */
export function FieldHelp({
  helpKey,
  label,
}: {
  readonly helpKey: FormHelpKey;
  readonly label?: string | undefined;
}) {
  const content = formHelp[helpKey];
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const titleId = `${id}-title`;
  const url = safeHelpUrl(content.learnMoreUrl);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    panel.current?.focus({ preventScroll: true });
    function outside(event: Event) {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      // Do not also dismiss a parent form dialog.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    }
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside, true);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside, true);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open]);

  return (
    <div className="contents" ref={root} data-field-help={helpKey}>
      <Button
        aria-label={`Ajuda sobre ${label ?? content.title}`}
        aria-expanded={open}
        aria-controls={id}
        className="min-h-11 min-w-11 shrink-0 rounded-full p-2 shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
        onClick={() => setOpen((value) => !value)}
        ref={trigger}
        variant="ghost"
      >
        <CircleHelp aria-hidden="true" className="h-4 w-4" />
      </Button>
      {open && (
        <div
          aria-labelledby={titleId}
          className="my-2 w-full min-w-0 basis-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm font-normal text-[var(--color-text)] [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-[var(--color-focus)]"
          id={id}
          ref={panel}
          role="region"
          tabIndex={-1}
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-semibold" id={titleId}>
              {content.title}
            </h3>
            <Button
              aria-label={`Fechar ajuda sobre ${label ?? content.title}`}
              className="min-h-11 min-w-11 p-2 shadow-none focus-visible:outline-2 focus-visible:outline-[var(--color-focus)]"
              onClick={close}
              variant="ghost"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          </div>
          <p>{content.description}</p>
          <dl className="mt-3 space-y-3">
            {(
              [
                ['Como preencher', content.howToFill],
                ['Exemplo', content.example],
                ['Validação', content.validation],
                ['Impacto no sistema', content.impact],
              ] as const
            ).map(([title, value]) => (
              <div key={title}>
                <dt className="font-semibold">{title}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {content.warning && (
            <p className="mt-3 border-l-2 border-[var(--color-warning)] pl-3">
              <strong>Atenção: </strong>
              {content.warning}
            </p>
          )}
          {url && (
            <a
              className="mt-3 inline-block underline focus-visible:outline-2"
              href={url}
            >
              Saiba mais na ajuda interna
            </a>
          )}
        </div>
      )}
    </div>
  );
}
