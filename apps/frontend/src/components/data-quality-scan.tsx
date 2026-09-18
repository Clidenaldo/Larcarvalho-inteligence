'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  dataQualityScanResultSchema,
  type AuthResponse,
} from '@larcarvalho/shared';
import { Button } from './ui/button';
import { Alert } from './ui/alert';
export function DataQualityScan({ identity }: { identity: AuthResponse }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  if (!identity.permissions.includes('data_quality.scan')) return null;
  return (
    <div className="space-y-3">
      <Button
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setResult(null);
          try {
            const response = await fetch('/api/data-quality/scan', {
              method: 'POST',
            });
            if (!response.ok) throw new Error('Falha ao executar verificação');
            const data = dataQualityScanResultSchema.parse(
              await response.json(),
            );
            setResult(
              `${data.registrosAvaliados} registros avaliados; ${data.issuesNovas} novas, ${data.issuesExistentes} existentes e ${data.resolvidasAutomaticamente} resolvidas automaticamente.`,
            );
            router.refresh();
          } catch (cause) {
            setResult(cause instanceof Error ? cause.message : 'Falha');
          } finally {
            setBusy(false);
          }
        }}
      >
        Executar verificação
      </Button>
      {result ? <Alert>{result}</Alert> : null}
    </div>
  );
}
