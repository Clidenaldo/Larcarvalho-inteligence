import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { parseEnvironment, type AppConfig } from '../../src/config/env.js';
import '../../src/config/load-env.js';
import { hashPassword } from '../../src/core/auth/password.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createPrismaClient } from '../../src/infrastructure/database/prisma-client.js';
import { wipeSalesData } from './clean-vendas.js';
import { IdentityService } from '../../src/modules/identity/identity.service.js';

const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;
const password = 'frase senha fase vinte um';
const cookie = (response: { headers: Record<string, unknown> }) => {
  const value = response.headers['set-cookie'];
  if (typeof value !== 'string') throw new Error('Cookie ausente');
  return value.split(';', 1)[0] as string;
};

run('phase 21 experience and profile with PostgreSQL', () => {
  let db: PrismaClient;
  let config: AppConfig;
  let identity: IdentityService;

  async function clean() {
    await wipeSalesData(db);
    await db.proposalStatusHistory.deleteMany();
    await db.proposalItem.deleteMany();
    await db.proposal.deleteMany();
    await db.simulationFavorite.deleteMany();
    await db.simulationResult.deleteMany();
    await db.simulationCalculationSnapshot.deleteMany();
    await db.simulationScenario.deleteMany();
    await db.simulation.deleteMany();
    await db.productCommercialRule.deleteMany();
    await db.commercialConfiguration.deleteMany();
    await db.leadInteracao.deleteMany();
    await db.leadInteresse.deleteMany();
    await db.lead.deleteMany();
    await db.grupoHistorico.deleteMany();
    await db.cota.deleteMany();
    await db.grupo.deleteMany();
    await db.tabelaComercialItem.deleteMany();
    await db.tabelaComercial.deleteMany();
    await db.produto.deleteMany();
    await db.administradora.deleteMany();
    await db.session.deleteMany();
    await db.auditLog.deleteMany();
    await db.user.deleteMany();
    await db.appearanceConfiguration.deleteMany();
  }

  beforeAll(() => {
    config = parseEnvironment({
      ...process.env,
      DATABASE_URL: url,
      FRONTEND_URL: 'http://frontend.test',
      LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
    });
    db = createPrismaClient(config);
    identity = new IdentityService(db, config);
  });

  beforeEach(clean);

  afterAll(async () => {
    await clean();
    await db.$disconnect();
  });

  it('updates appearance only for admins and audits the change', async () => {
    const passwordHash = await hashPassword(password);
    const [admin, manager] = await Promise.all([
      db.user.create({
        data: {
          email: 'admin.phase21@example.com',
          nome: 'Admin Fase 21',
          passwordHash,
          role: 'ADMIN',
        },
      }),
      db.user.create({
        data: {
          email: 'gestor.phase21@example.com',
          nome: 'Gestor Fase 21',
          passwordHash,
          role: 'GESTOR',
        },
      }),
    ]);
    const app = await buildApp({
      config,
      identityService: identity,
      logger: false,
    });
    try {
      const login = async (email: string) =>
        cookie(
          await app.inject({
            method: 'POST',
            url: '/api/v1/auth/login',
            payload: { email, password },
          }),
        );
      const adminCookie = await login(admin.email);
      const managerCookie = await login(manager.email);
      const getResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/appearance',
        headers: { cookie: adminCookie },
      });
      expect(getResponse.statusCode).toBe(200);
      expect(getResponse.json()).toMatchObject({
        commercialName: 'Larcarvalho Consórcios',
        primaryColor: '#34806b',
      });

      const denied = await app.inject({
        method: 'PATCH',
        url: '/api/v1/appearance',
        headers: { cookie: managerCookie, origin: 'http://frontend.test' },
        payload: { commercialName: 'Gestor sem acesso' },
      });
      expect(denied.statusCode).toBe(403);

      const updated = await app.inject({
        method: 'PATCH',
        url: '/api/v1/appearance',
        headers: { cookie: adminCookie, origin: 'http://frontend.test' },
        payload: {
          accentColor: '#c05400',
          commercialName: 'Larcarvalho Consórcios Premium',
          primaryColor: '#34806b',
        },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({
        commercialName: 'Larcarvalho Consórcios Premium',
        version: 2,
      });
      await expect(
        db.auditLog.count({
          where: {
            action: 'APPEARANCE_CONFIGURATION_UPDATED',
            actorId: admin.id,
          },
        }),
      ).resolves.toBe(1);
    } finally {
      await app.close();
    }
  });

  it('allows users to update only their own profile preferences', async () => {
    const passwordHash = await hashPassword(password);
    const seller = await db.user.create({
      data: {
        email: 'seller.phase21@example.com',
        nome: 'Vendedora Fase 21',
        passwordHash,
        role: 'VENDEDOR',
      },
    });
    const app = await buildApp({
      config,
      identityService: identity,
      logger: false,
    });
    try {
      const sellerCookie = cookie(
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: { email: seller.email, password },
        }),
      );
      const updated = await app.inject({
        method: 'PATCH',
        url: '/api/v1/account',
        headers: { cookie: sellerCookie, origin: 'http://frontend.test' },
        payload: {
          interfacePreferences: {
            density: 'compact',
            reducedMotion: true,
            theme: 'system',
          },
          nome: 'Consultora Fase 21',
          telefoneWhatsapp: '+55 85 99999-9999',
        },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({
        email: seller.email,
        interfacePreferences: { density: 'compact', reducedMotion: true },
        nome: 'Consultora Fase 21',
        telefoneWhatsapp: '+55 85 99999-9999',
      });
      const account = await app.inject({
        method: 'GET',
        url: '/api/v1/account',
        headers: { cookie: sellerCookie },
      });
      expect(account.statusCode).toBe(200);
      expect(account.json().activity[0]).toMatchObject({
        action: 'USER_PROFILE_UPDATED',
        entity: 'User',
      });
      await expect(
        db.auditLog.count({
          where: { action: 'USER_PROFILE_UPDATED', actorId: seller.id },
        }),
      ).resolves.toBe(1);
    } finally {
      await app.close();
    }
  });
});
