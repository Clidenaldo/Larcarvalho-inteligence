'use client';

import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

import { cn } from '../../lib/styles';
import type { FormHelpKey } from '../../lib/form-help';
import { FieldHelp } from './field-help';

interface FieldProps {
  readonly children: ReactNode;
  readonly error?: string | undefined;
  readonly help?: string | undefined;
  readonly helpKey?: FormHelpKey | undefined;
  readonly label: string;
  readonly required?: boolean | undefined;
}

export function Field({
  children,
  error,
  help,
  helpKey,
  label,
  required,
}: FieldProps) {
  const generatedId = useId();
  const messageId = `${generatedId}-message`;
  let controlId: string | undefined;
  // Link the actual input, not a stepper button or its containing div.
  function associate(nodes: ReactNode): ReactNode {
    return Children.map(nodes, (child) => {
      if (
        !isValidElement<{
          id?: string | undefined;
          children?: ReactNode;
          'aria-describedby'?: string | undefined;
          'aria-invalid'?:
            boolean | 'true' | 'false' | 'grammar' | 'spelling' | undefined;
        }>(child)
      )
        return child;
      if (
        !controlId &&
        (child.type === Input ||
          child.type === Select ||
          child.type === Textarea ||
          child.type === 'input' ||
          child.type === 'select' ||
          child.type === 'textarea')
      ) {
        controlId = child.props.id ?? generatedId;
        return cloneElement(child, {
          id: controlId,
          'aria-describedby':
            [child.props['aria-describedby'], (error || help) && messageId]
              .filter(Boolean)
              .join(' ') || undefined,
          'aria-invalid': error ? true : child.props['aria-invalid'],
        });
      }
      return child.props.children
        ? cloneElement(child, { children: associate(child.props.children) })
        : child;
    });
  }
  const controls = associate(children);
  return (
    <div className="block min-w-0 text-sm font-medium text-[var(--color-text)]">
      <div className="flex flex-wrap items-center gap-x-1">
        <label htmlFor={controlId}>
          {label}
          {required ? (
            <span
              aria-hidden="true"
              className="ml-1 text-[var(--color-danger)]"
            >
              *
            </span>
          ) : null}
        </label>
        {helpKey && <FieldHelp helpKey={helpKey} label={label} />}
      </div>
      <div className="mt-2 block">{controls}</div>
      {error ? (
        <span
          id={messageId}
          className="mt-1.5 block text-xs text-[var(--color-danger)]"
        >
          {error}
        </span>
      ) : help ? (
        <span
          id={messageId}
          className="mt-1.5 block text-xs text-[var(--color-muted)]"
        >
          {help}
        </span>
      ) : null}
    </div>
  );
}

const controlClass =
  'min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3.5 text-sm text-[var(--color-text)] shadow-[var(--shadow-sm)] placeholder:text-[var(--color-muted)] hover:border-[var(--color-muted)] focus:border-[var(--color-primary)] focus:ring-3 focus:ring-[var(--color-primary-soft)] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 aria-invalid:border-[var(--color-danger)] aria-invalid:ring-red-700/10';

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return <input className={cn(controlClass, className)} ref={ref} {...props} />;
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, ...props }, ref) {
  return (
    <select className={cn(controlClass, className)} ref={ref} {...props} />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      className={cn(controlClass, 'min-h-32 py-2.5', className)}
      ref={ref}
      {...props}
    />
  );
});
