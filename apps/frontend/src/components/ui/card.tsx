import type { CSSProperties, ReactNode } from 'react';

import { cn } from '../../lib/styles';

interface CardProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
}

export function Card({ children, className, style }: CardProps) {
  return (
    <section
      data-ui="card"
      className={cn(
        'rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]',
        className,
      )}
      style={style}
    >
      {children}
    </section>
  );
}
