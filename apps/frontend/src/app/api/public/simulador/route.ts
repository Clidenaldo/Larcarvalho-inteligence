import { getFrontendConfig } from '../../../../config/env';
import { proxyIdentityRequest } from '../../../../services/api/identity-proxy';

export async function POST(request: Request) {
  const config = getFrontendConfig();
  return proxyIdentityRequest(
    request,
    '/api/v1/public/simulador',
    config.simulatorTimeoutMs,
  );
}
