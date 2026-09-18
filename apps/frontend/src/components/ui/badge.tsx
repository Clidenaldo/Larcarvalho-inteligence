import type { ReactNode } from 'react';

import { cn } from '../../lib/styles';

type BadgeTone = 'danger' | 'info' | 'neutral' | 'success' | 'warning';

const tones: Record<BadgeTone, string> = {
  danger: 'bg-red-50 text-[var(--color-danger)] ring-red-600/15',
  info: 'bg-blue-50 text-[var(--color-info)] ring-blue-600/15',
  neutral: 'bg-slate-100 text-slate-600 ring-slate-500/15',
  success:
    'bg-[var(--color-primary-soft)] text-[var(--color-success)] ring-[var(--color-success)]/15',
  warning: 'bg-amber-50 text-[var(--color-warning)] ring-amber-600/15',
};

export function Badge({
  children,
  tone = 'neutral',
}: {
  readonly children: ReactNode;
  readonly tone?: BadgeTone;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
