import { LoaderCircle } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cn } from '../../lib/styles';

export type ButtonVariant =
  'danger' | 'ghost' | 'outline' | 'primary' | 'secondary';

const variants: Record<ButtonVariant, string> = {
  danger:
    'bg-[var(--color-danger)] text-white hover:bg-[var(--color-danger-hover)]',
  ghost:
    'bg-transparent text-[var(--color-text-soft)] hover:bg-slate-100 hover:text-[var(--color-text)]',
  outline:
    'border border-[var(--color-border-strong)] bg-white text-[var(--color-text)] hover:bg-slate-50',
  primary:
    'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]',
  secondary:
    'bg-[var(--color-secondary)] text-white hover:bg-[var(--color-secondary-hover)]',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly children: ReactNode;
  readonly loading?: boolean;
  readonly variant?: ButtonVariant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      children,
      className,
      disabled,
      loading = false,
      type = 'button',
      variant = 'primary',
      ...props
    },
    ref,
  ) {
    return (
      <button
        data-button-variant={variant}
        aria-busy={loading || undefined}
        className={cn(
          'inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 py-2 text-sm font-semibold shadow-[var(--shadow-sm)] disabled:cursor-not-allowed disabled:opacity-55',
          variants[variant],
          className,
        )}
        disabled={disabled || loading}
        ref={ref}
        type={type}
        {...props}
      >
        {loading ? (
          <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
        ) : null}
        {children}
      </button>
    );
  },
);
