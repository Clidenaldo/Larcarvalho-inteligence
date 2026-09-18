import { proxyIdentityRequest } from '../../../services/api/identity-proxy';
export async function GET(r: Request) {
  const u = new URL(r.url);
  return proxyIdentityRequest(r, `/api/v1/contemplacoes?${u.searchParams}`);
}
export async function POST(r: Request) {
  return proxyIdentityRequest(r, '/api/v1/contemplacoes');
}
