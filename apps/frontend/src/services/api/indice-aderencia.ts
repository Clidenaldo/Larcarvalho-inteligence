import {
  calcularIndiceAderenciaResponseSchema,
  type CalcularIndiceAderenciaRequest,
} from '@larcarvalho/shared';
import { cookies } from 'next/headers';
import { getFrontendConfig } from '../../config/env';

type Failure = 'forbidden' | 'not-found' | 'unauthorized' | 'conflict';

export async function calculateAdherence(
  input: CalcularIndiceAderenciaRequest,
) {
  const config = getFrontendConfig();
  const store = await cookies();
  const response = await fetch(
    `${config.apiBaseUrl}/api/v1/indice-aderencia/calcular`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        cookie: store.toString(),
        'content-type': 'application/json',
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(config.apiTimeoutMs),
    },
  );
  const failure: Failure | null =
    response.status === 401
      ? 'unauthorized'
      : response.status === 403
        ? 'forbidden'
        : response.status === 404
          ? 'not-found'
          : response.status === 409
            ? 'conflict'
            : null;
  if (failure) return failure;
  if (!response.ok) throw new Error('Não foi possível calcular a aderência');
  return calcularIndiceAderenciaResponseSchema.parse(await response.json());
}
