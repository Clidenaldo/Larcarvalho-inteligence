import { proxyIdentityRequest } from '../../../services/api/identity-proxy';
export async function GET(request: Request) {
 return proxyIdentityRequest(request, `/api/v1/teams`);
}
export async function POST(request: Request) {
 return proxyIdentityRequest(request, `/api/v1/teams`);
}
