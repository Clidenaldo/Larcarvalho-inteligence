import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import '../../src/config/load-env.js';
import { parseEnvironment, type AppConfig } from '../../src/config/env.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createPrismaClient } from '../../src/infrastructure/database/prisma-client.js';
import { wipeSalesData } from './clean-vendas.js';
import { IdentityService } from '../../src/modules/identity/identity.service.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describePostgresql = testDatabaseUrl ? describe : describe.skip;
const password = 'frase senha inicial segura';

function configForTest(): AppConfig {
  return parseEnvironment({
    ...process.env,
    AUTH_LOGIN_RATE_LIMIT_MAX: '100',
    DATABASE_POOL_MAX: '3',
    DATABASE_URL: testDatabaseUrl,
    FRONTEND_URL: 'http://frontend.test',
    LOG_LEVEL: 'silent',
    NODE_ENV: 'test',
  });
}

function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const value = response.headers['set-cookie'];
  if (typeof value !== 'string') throw new Error('Cookie de sessão ausente');
  return value.split(';', 1)[0] as string;
}

describePostgresql('administradoras HTTP module', () => {
  let config: AppConfig;
  let identity: IdentityService;
  let prisma: PrismaClient;

  beforeAll(() => {
    config = configForTest();
    prisma = createPrismaClient(config);
    identity = new IdentityService(prisma, config);
  });

  beforeEach(async () => {
    await wipeSalesData(prisma);
    await prisma.contemplacao.deleteMany();
    await prisma.lance.deleteMany();
    await prisma.assembleia.deleteMany();
    await prisma.cota.deleteMany();
    await prisma.grupo.deleteMany();
    await prisma.produto.deleteMany();
    await prisma.auditLog.deleteMany({ where: { entity: 'Administradora' } });
    await prisma.administradora.deleteMany();
    await prisma.session.deleteMany();
    await prisma.auditLog.deleteMany({ where: { entity: 'User' } });
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await wipeSalesData(prisma);
    await prisma?.contemplacao.deleteMany();
    await prisma?.lance.deleteMany();
    await prisma?.assembleia.deleteMany();
    await prisma?.cota.deleteMany();
    await prisma?.grupo.deleteMany();
    await prisma?.produto.deleteMany();
    await prisma?.auditLog.deleteMany({ where: { entity: 'Administradora' } });
    await prisma?.administradora.deleteMany();
    await prisma?.session.deleteMany();
    await prisma?.auditLog.deleteMany({ where: { entity: 'User' } });
    await prisma?.user.deleteMany();
    await prisma?.$disconnect();
  });

  it('normalizes, searches, updates and audits the commercial record', async () => {
    await identity.createFirstSuperAdmin({
      email: 'root@example.com',
      nome: 'Root Admin',
      password,
    });
    const app = await buildApp({
      config,
      identityService: identity,
      logger: false,
    });
    try {
      const login = await app.inject({
        method: 'POST',
        payload: { email: 'root@example.com', password },
        url: '/api/v1/auth/login',
      });
      const cookie = cookieFrom(login);
      const create = await app.inject({
        headers: { cookie, origin: 'http://frontend.test' },
        method: 'POST',
        payload: {
          cnpj: '04.252.011/0001-10',
          nome: 'Administradora Alfa',
          site: 'https://alfa.example.com',
        },
        url: '/api/v1/administradoras',
      });
      expect(create.statusCode).toBe(201);
      expect(create.json().cnpj).toBe('04252011000110');
      const id = create.json().id as string;

      const duplicate = await app.inject({
        headers: { cookie, origin: 'http://frontend.test' },
        method: 'POST',
        payload: { cnpj: '04252011000110', nome: 'Duplicada' },
        url: '/api/v1/administradoras',
      });
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json().error.code).toBe('ADMINISTRADORA_CONFLICT');

      const listing = await app.inject({
        headers: { cookie },
        method: 'GET',
        url: '/api/v1/administradoras?search=04252011000110&status=ativas',
      });
      expect(listing.statusCode).toBe(200);
      expect(listing.json().items).toHaveLength(1);

      const update = await app.inject({
        headers: { cookie, origin: 'http://frontend.test' },
        method: 'PATCH',
        payload: { nomeFantasia: 'Alfa' },
        url: `/api/v1/administradoras/${id}`,
      });
      expect(update.statusCode).toBe(200);

      const status = await app.inject({
        headers: { cookie, origin: 'http://frontend.test' },
        method: 'PATCH',
        payload: { ativa: false },
        url: `/api/v1/administradoras/${id}/status`,
      });
      expect(status.statusCode).toBe(200);
      expect(status.json().ativa).toBe(false);
      await expect(
        prisma.auditLog.count({
          where: { entity: 'Administradora', entityId: id },
        }),
      ).resolves.toBe(3);
    } finally {
      await app.close();
    }
  });
});
