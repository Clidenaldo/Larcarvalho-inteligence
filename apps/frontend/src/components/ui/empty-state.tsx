import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({
  action,
  description,
  title,
}: {
  readonly action?: ReactNode;
  readonly description: string;
  readonly title: string;
}) {
  return (
    <div className="grid place-items-center px-6 py-14 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
        <Inbox aria-hidden="true" className="h-5 w-5" />
      </div>
      <h3 className="mt-4 font-semibold text-[var(--color-text)]">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-[var(--color-muted)]">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
