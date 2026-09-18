import { proxyIdentityRequest } from '../../../../services/api/identity-proxy';
export async function PUT(request: Request) {
 return proxyIdentityRequest(request, `/api/v1/teams/members`);
}
