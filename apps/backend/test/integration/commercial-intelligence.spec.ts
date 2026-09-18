import { randomUUID } from 'node:crypto';
import { commercialIntelligenceSchema } from '@larcarvalho/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import '../../src/config/load-env.js';
import { parseEnvironment } from '../../src/config/env.js';
import { hashSessionToken } from '../../src/core/auth/session-token.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createPrismaClient } from '../../src/infrastructure/database/prisma-client.js';
import { IdentityService } from '../../src/modules/identity/identity.service.js';

const testUrl = process.env.TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;
suite('commercial intelligence with PostgreSQL', () => {
  let db: PrismaClient;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const emails = ['ci-seller-a@test.local', 'ci-seller-b@test.local', 'ci-manager@test.local'];
  const cookies = new Map<string, string>();

  async function clean() {
    const users = await db.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
    const ids = users.map(x => x.id);
    await db.lead.deleteMany({ where: { responsavelId: { in: ids } } });
    await db.session.deleteMany({ where: { userId: { in: ids } } });
    await db.userPermissionOverride.deleteMany({ where: { userId: { in: ids } } });
    await db.team.updateMany({ where: { managerId: { in: ids } }, data: { managerId: null } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.team.deleteMany({ where: { name: 'Equipe CI 27' } });
    cookies.clear();
  }
  async function loginUser(email: string, role: 'VENDEDOR' | 'GESTOR', teamId?: string) {
    const user = await db.user.create({ data: { nome: email, email, role, passwordHash: 'hash-seguro-teste', ...(teamId ? { teamId } : {}) } });
    const token = randomUUID();
    await db.session.create({ data: { userId: user.id, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 3_600_000) } });
    cookies.set(email, `larcarvalho_session=${token}`);
    return user;
  }
  beforeAll(async () => {
    const config = parseEnvironment({ ...process.env, DATABASE_URL: testUrl, FRONTEND_URL: 'http://frontend.test', NODE_ENV: 'test', LOG_LEVEL: 'silent' });
    db = createPrismaClient(config); app = await buildApp({ config, identityService: new IdentityService(db, config), logger: false });
  });
  beforeEach(clean);
  afterAll(async () => { await clean(); await app.close(); await db.$disconnect(); });

  it('enforces OWN and TEAM and removes financial JSON after a permission deny', async () => {
    const team = await db.team.create({ data: { name: 'Equipe CI 27' } });
    const sellerA = await loginUser(emails[0]!, 'VENDEDOR', team.id);
    const sellerB = await loginUser(emails[1]!, 'VENDEDOR');
    const manager = await loginUser(emails[2]!, 'GESTOR', team.id);
    await db.team.update({ where: { id: team.id }, data: { managerId: manager.id } });
    await db.userPermissionOverride.create({ data: { userId: sellerA.id, permission: 'commissions.read', effect: 'DENY' } });
    await db.lead.createMany({ data: [
      { nome: 'Cliente A1', emailNormalizado: 'ci-a1@test.local', origem: 'CADASTRO_MANUAL', responsavelId: sellerA.id },
      { nome: 'Cliente A2', emailNormalizado: 'ci-a2@test.local', origem: 'CADASTRO_MANUAL', responsavelId: sellerA.id },
      { nome: 'Cliente B', emailNormalizado: 'ci-b@test.local', origem: 'CADASTRO_MANUAL', responsavelId: sellerB.id },
    ] });
    const ownResponse = await app.inject({ method: 'GET', url: '/api/v1/commercial-intelligence/overview?scope=OWN&period=30d', headers: { cookie: cookies.get(emails[0]!)! } });
    expect(ownResponse.statusCode).toBe(200);
    const own = commercialIntelligenceSchema.parse(ownResponse.json());
    expect(own.summary.activeClients).toBe(2); expect(own.financial).toBeUndefined(); expect(ownResponse.body).not.toContain('confirmedReceivable');
    const escalation = await app.inject({ method: 'GET', url: '/api/v1/commercial-intelligence/overview?scope=ALL', headers: { cookie: cookies.get(emails[0]!)! } });
    expect(escalation.statusCode).toBe(403);
    const teamResponse = await app.inject({ method: 'GET', url: '/api/v1/commercial-intelligence/overview?scope=TEAM', headers: { cookie: cookies.get(emails[2]!)! } });
    const teamData = commercialIntelligenceSchema.parse(teamResponse.json());
    expect(teamData.summary.activeClients).toBe(2);
    expect(teamData.performance.map(x => x.sellerId)).not.toContain(sellerB.id);
  });
});
