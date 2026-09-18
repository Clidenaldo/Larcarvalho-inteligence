export type ApiClientErrorKind =
  'http_error' | 'invalid_response' | 'network_error' | 'timeout';

export class ApiClientError extends Error {
  override readonly name = 'ApiClientError';
  readonly kind: ApiClientErrorKind;
  readonly statusCode: number | undefined;

  constructor(kind: ApiClientErrorKind, message: string, statusCode?: number) {
    super(message);
    this.kind = kind;
    this.statusCode = statusCode;
  }
}

export interface GetJsonOptions<T> {
  readonly baseUrl: string;
  readonly parse: (payload: unknown) => T;
  readonly path: string;
  readonly timeoutMs: number;
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError';
}

export async function getJson<T>(options: GetJsonOptions<T>): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${options.baseUrl}${options.path}`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new ApiClientError('timeout', 'A API excedeu o tempo de resposta');
    }

    throw new ApiClientError('network_error', 'Não foi possível acessar a API');
  }

  if (!response.ok) {
    throw new ApiClientError(
      'http_error',
      'A API respondeu com erro',
      response.status,
    );
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new ApiClientError(
      'invalid_response',
      'A API retornou JSON inválido',
    );
  }

  try {
    return options.parse(payload);
  } catch {
    throw new ApiClientError(
      'invalid_response',
      'A resposta da API não corresponde ao contrato',
    );
  }
}
