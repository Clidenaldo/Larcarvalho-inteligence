import { proxyIdentityRequest } from '../../../services/api/identity-proxy';

function target(request: Request) {
  return `/api/v1/tabelas-comerciais${new URL(request.url).search}`;
}
export async function GET(request: Request) {
  return proxyIdentityRequest(request, target(request));
}
export async function POST(request: Request) {
  return proxyIdentityRequest(request, target(request));
}
