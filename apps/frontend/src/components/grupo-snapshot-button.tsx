'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from './ui/alert';
import { Button } from './ui/button';

export function GrupoSnapshotButton({ grupoId }: { grupoId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const requestInFlight = useRef(false);
  return (
    <div className="space-y-2">
      <Button
        loading={busy}
        onClick={async () => {
          if (requestInFlight.current) return;
          requestInFlight.current = true;
          idempotencyKey.current ??= crypto.randomUUID();
          setBusy(true);
          setError(null);
          try {
            const response = await fetch(
              `/api/grupos/${grupoId}/historico/snapshot`,
              {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  idempotencyKey: idempotencyKey.current,
                }),
              },
            );
            if (!response.ok)
              throw new Error('Não foi possível registrar o snapshot');
            idempotencyKey.current = null;
            router.refresh();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Falha');
          } finally {
            requestInFlight.current = false;
            setBusy(false);
          }
        }}
      >
        Registrar snapshot atual
      </Button>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
