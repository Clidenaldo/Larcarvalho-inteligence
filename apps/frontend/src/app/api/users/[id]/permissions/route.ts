import { proxyIdentityRequest } from '../../../../../services/api/identity-proxy';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
 const { id } = await context.params;
 return proxyIdentityRequest(request, `/api/v1/users/${id}/permissions`);
}
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
 const { id } = await context.params;
 return proxyIdentityRequest(request, `/api/v1/users/${id}/permissions`);
}
