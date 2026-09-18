import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../../lib/styles';

type AlertTone = 'danger' | 'info' | 'success';

const styles: Record<AlertTone, string> = {
  danger: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-blue-200 bg-blue-50 text-blue-800',
  success:
    'border-[var(--color-success)]/25 bg-[var(--color-primary-soft)] text-[var(--color-success)]',
};

export function Alert({
  children,
  tone = 'info',
}: {
  readonly children: ReactNode;
  readonly tone?: AlertTone;
}) {
  const Icon =
    tone === 'danger' ? AlertCircle : tone === 'success' ? CheckCircle2 : Info;
  return (
    <div
      aria-live="polite"
      className={cn(
        'flex gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-sm',
        styles[tone],
      )}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
