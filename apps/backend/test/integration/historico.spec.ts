import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import '../../src/config/load-env.js';
import { parseEnvironment, type AppConfig } from '../../src/config/env.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createPrismaClient } from '../../src/infrastructure/database/prisma-client.js';
import { wipeSalesData } from './clean-vendas.js';
import { IdentityService } from '../../src/modules/identity/identity.service.js';
const url = process.env.TEST_DATABASE_URL,
  d = url ? describe : describe.skip,
  password = 'frase senha inicial segura';
const cfg = () =>
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
  if (typeof v !== 'string') throw new Error('cookie');
  return v.split(';', 1)[0] as string;
};
d('historical assembly flow', () => {
  let prisma: PrismaClient, identity: IdentityService, config: AppConfig;
  beforeAll(() => {
    config = cfg();
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
    await prisma.administradora.deleteMany();
    await prisma.session.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });
  it('creates and audits assembly, bid and award while rejecting cross-group quota', async () => {
    await identity.createFirstSuperAdmin({
      email: 'root@example.com',
      nome: 'Root',
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
          url: '/api/v1/auth/login',
          payload: { email: 'root@example.com', password },
        }),
        headers = { cookie: cookie(login), origin: 'http://frontend.test' };
      const a1 = await prisma.administradora.create({
          data: { nome: 'Técnica' },
        }),
        g1 = await prisma.grupo.create({
          data: { administradoraId: a1.id, codigo: 'G1', status: 'ATIVO' },
        }),
        g2 = await prisma.grupo.create({
          data: { administradoraId: a1.id, codigo: 'G2', status: 'ATIVO' },
        }),
        c1 = await prisma.cota.create({
          data: { grupoId: g1.id, numero: '001', status: 'ATIVO' },
        }),
        c2 = await prisma.cota.create({
          data: { grupoId: g2.id, numero: '002', status: 'ATIVO' },
        });
      const ass = await app.inject({
        method: 'POST',
        url: '/api/v1/assembleias',
        headers,
        payload: {
          grupoId: g1.id,
          numero: '1',
          dataAssembleia: '2026-09-01T12:00:00.000Z',
          status: 'REALIZADA',
        },
      });
      expect(ass.statusCode).toBe(201);
      const assembleiaId = ass.json().id as string;
      const lance = await app.inject({
        method: 'POST',
        url: '/api/v1/lances',
        headers,
        payload: {
          assembleiaId,
          cotaId: c1.id,
          tipo: 'LIVRE',
          percentual: '20.123456',
          valor: '1000.00',
          contemplado: true,
          origem: 'MANUAL',
        },
      });
      expect(lance.statusCode).toBe(201);
      const bad = await app.inject({
        method: 'POST',
        url: '/api/v1/lances',
        headers,
        payload: {
          assembleiaId,
          cotaId: c2.id,
          tipo: 'LIVRE',
          origem: 'MANUAL',
        },
      });
      expect(bad.statusCode).toBe(409);
      const award = await app.inject({
        method: 'POST',
        url: '/api/v1/contemplacoes',
        headers,
        payload: {
          assembleiaId,
          cotaId: c1.id,
          tipo: 'LANCE',
          codigoExterno: 'C-1',
          percentualLance: '20.123456',
        },
      });
      expect(award.statusCode).toBe(201);
      const list = await app.inject({
        method: 'GET',
        url: `/api/v1/lances?grupoId=${g1.id}&contemplado=true`,
        headers: { cookie: headers.cookie },
      });
      expect(list.json().items).toHaveLength(1);
      await expect(
        prisma.auditLog.count({
          where: { entity: { in: ['Assembleia', 'Lance', 'Contemplacao'] } },
        }),
      ).resolves.toBe(3);
    } finally {
      await app.close();
    }
  });
});
