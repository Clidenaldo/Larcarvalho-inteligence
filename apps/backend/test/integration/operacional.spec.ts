import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import '../../src/config/load-env.js';
import { parseEnvironment, type AppConfig } from '../../src/config/env.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createPrismaClient } from '../../src/infrastructure/database/prisma-client.js';
import { wipeSalesData } from './clean-vendas.js';
import { IdentityService } from '../../src/modules/identity/identity.service.js';
const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const password = 'frase senha inicial segura';
const config = () =>
  parseEnvironment({
    ...process.env,
    AUTH_LOGIN_RATE_LIMIT_MAX: '100',
    DATABASE_POOL_MAX: '3',
    DATABASE_URL: url,
    FRONTEND_URL: 'http://frontend.test',
    LOG_LEVEL: 'silent',
    NODE_ENV: 'test',
  });
const cookie = (r: { headers: Record<string, unknown> }) => {
  const v = r.headers['set-cookie'];
  if (typeof v !== 'string') throw new Error('Cookie ausente');
  return v.split(';', 1)[0] as string;
};
d('operational product/group/quota flow', () => {
  let prisma: PrismaClient, identity: IdentityService, appConfig: AppConfig;
  beforeAll(() => {
    appConfig = config();
    prisma = createPrismaClient(appConfig);
    identity = new IdentityService(prisma, appConfig);
  });
  beforeEach(async () => {
    await wipeSalesData(prisma);
    await prisma.contemplacao.deleteMany();
    await prisma.lance.deleteMany();
    await prisma.assembleia.deleteMany();
    await prisma.auditLog.deleteMany({
      where: {
        entity: { in: ['Produto', 'Grupo', 'Cota', 'Administradora', 'User'] },
      },
    });
    await prisma.cota.deleteMany();
    await prisma.grupo.deleteMany();
    await prisma.produto.deleteMany();
    await prisma.administradora.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });
  it('creates, searches, updates and audits the hierarchy', async () => {
    await identity.createFirstSuperAdmin({
      email: 'root@example.com',
      nome: 'Root',
      password,
    });
    const app = await buildApp({
      config: appConfig,
      identityService: identity,
      logger: false,
    });
    try {
      const login = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: { email: 'root@example.com', password },
        }),
        headers = { cookie: cookie(login), origin: 'http://frontend.test' };
      const admin = await app.inject({
        method: 'POST',
        url: '/api/v1/administradoras',
        headers,
        payload: { nome: 'Admin técnica' },
      });
      const a = admin.json().id as string;
      const product = await app.inject({
        method: 'POST',
        url: '/api/v1/produtos',
        headers,
        payload: { administradoraId: a, nome: 'Imóvel', categoria: 'IMOVEL' },
      });
      expect(product.statusCode).toBe(201);
      const p = product.json().id as string;
      const group = await app.inject({
        method: 'POST',
        url: '/api/v1/grupos',
        headers,
        payload: {
          administradoraId: a,
          produtoId: p,
          codigo: 'G-001',
          status: 'ATIVO',
          prazoMeses: 120,
          valorCreditoMinimo: '1000.00',
          valorCreditoMaximo: '2000.00',
        },
      });
      expect(group.statusCode).toBe(201);
      const g = group.json().id as string;
      const quota = await app.inject({
        method: 'POST',
        url: '/api/v1/cotas',
        headers,
        payload: {
          grupoId: g,
          numero: '001',
          status: 'ATIVO',
          valorCredito: '1500.00',
          prazoRestante: 120,
        },
      });
      expect(quota.statusCode).toBe(201);
      const duplicate = await app.inject({
        method: 'POST',
        url: '/api/v1/cotas',
        headers,
        payload: { grupoId: g, numero: '001', status: 'ATIVO' },
      });
      expect(duplicate.statusCode).toBe(409);
      const listed = await app.inject({
        method: 'GET',
        url: '/api/v1/cotas?administradoraId=' + a,
        headers: { cookie: headers.cookie },
      });
      expect(listed.json().items).toHaveLength(1);
      const changed = await app.inject({
        method: 'PATCH',
        url: `/api/v1/grupos/${g}/status`,
        headers,
        payload: { status: 'INATIVO' },
      });
      expect(changed.statusCode).toBe(200);
      await expect(
        prisma.auditLog.count({
          where: { entity: { in: ['Produto', 'Grupo', 'Cota'] } },
        }),
      ).resolves.toBe(4);
    } finally {
      await app.close();
    }
  });
});
