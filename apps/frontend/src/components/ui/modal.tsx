'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

interface ModalProps {
  readonly children: ReactNode;
  readonly description?: string;
  readonly onClose: () => void;
  readonly open: boolean;
  readonly title: string;
}

export function Modal({
  children,
  description,
  onClose,
  open,
  title,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-white p-0 text-[var(--color-text)] shadow-[var(--shadow-md)]"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      ref={dialogRef}
    >
      <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-6 py-5">
        <div>
          <h2 className="text-lg font-semibold" id={titleId}>
            {title}
          </h2>
          {description ? (
            <p
              className="mt-1 text-sm text-[var(--color-muted)]"
              id={descriptionId}
            >
              {description}
            </p>
          ) : null}
        </div>
        <button
          aria-label="Fechar"
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </dialog>
  );
}
