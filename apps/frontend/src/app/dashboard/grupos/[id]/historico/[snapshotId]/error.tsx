'use client';
import { Alert } from '../../../../../../components/ui/alert';
import { Button } from '../../../../../../components/ui/button';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <Alert tone="danger">
      <div className="space-y-3">
        <p>Não foi possível carregar o snapshot.</p>
        <Button variant="outline" onClick={reset}>
          Tentar novamente
        </Button>
      </div>
    </Alert>
  );
}
