import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import '../../src/config/load-env.js';
import { parseEnvironment, type AppConfig } from '../../src/config/env.js';
import { hashSessionToken } from '../../src/core/auth/session-token.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createPrismaClient } from '../../src/infrastructure/database/prisma-client.js';
import { wipeSalesData } from './clean-vendas.js';
import { IdentityService } from '../../src/modules/identity/identity.service.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describePostgresql = testDatabaseUrl ? describe : describe.skip;
const password = 'frase senha inicial segura';

function configForTest(overrides: NodeJS.ProcessEnv = {}): AppConfig {
  return parseEnvironment({
    ...process.env,
    AUTH_LOGIN_RATE_LIMIT_MAX: '100',
    DATABASE_POOL_MAX: '3',
    DATABASE_URL: testDatabaseUrl,
    FRONTEND_URL: 'http://frontend.test',
    LOG_LEVEL: 'silent',
    NODE_ENV: 'test',
    ...overrides,
  });
}

function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const value = response.headers['set-cookie'];
  if (typeof value !== 'string') throw new Error('Cookie de sessão ausente');
  return value.split(';', 1)[0] as string;
}

describePostgresql('authentication and RBAC with PostgreSQL', () => {
  let prisma: PrismaClient;
  let config: AppConfig;
  let identity: IdentityService;

  beforeAll(() => {
    config = configForTest();
    prisma = createPrismaClient(config);
    identity = new IdentityService(prisma, config);
  });

  beforeEach(async () => {
    await wipeSalesData(prisma);
    await prisma.session.deleteMany();
    await prisma.auditLog.deleteMany({ where: { entity: 'User' } });
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await wipeSalesData(prisma);
    await prisma?.session.deleteMany();
    await prisma?.auditLog.deleteMany({ where: { entity: 'User' } });
    await prisma?.user.deleteMany();
    await prisma?.$disconnect();
  });

  async function bootstrap() {
    return identity.createFirstSuperAdmin({
      email: 'root@example.com',
      nome: 'Root Admin',
      password,
    });
  }

  it('creates a session, exposes only safe data, expires it, and logs out', async () => {
    const root = await bootstrap();
    const app = await buildApp({
      config,
      identityService: identity,
      logger: false,
    });

    try {
      const wrongExisting = await app.inject({
        method: 'POST',
        payload: { email: root.email, password: 'senha incorreta longa' },
        url: '/api/v1/auth/login',
      });
      const wrongMissing = await app.inject({
        method: 'POST',
        payload: {
          email: 'missing@example.com',
          password: 'senha incorreta longa',
        },
        url: '/api/v1/auth/login',
      });
      expect(wrongExisting.statusCode).toBe(401);
      expect(wrongMissing.statusCode).toBe(401);
      expect(wrongExisting.json().error.message).toBe('Credenciais inválidas');
      expect(wrongMissing.json().error.message).toBe('Credenciais inválidas');

      const login = await app.inject({
        method: 'POST',
        payload: { email: ' ROOT@example.com ', password },
        url: '/api/v1/auth/login',
      });
      expect(login.statusCode).toBe(200);
      expect(login.body).not.toContain('passwordHash');
      expect(login.body).not.toContain('tokenHash');
      expect(login.headers['set-cookie']).toContain('HttpOnly');
      expect(login.headers['set-cookie']).toContain('SameSite=Strict');
      const cookie = cookieFrom(login);
      const rawToken = cookie.slice(cookie.indexOf('=') + 1);
      const stored = await prisma.session.findFirstOrThrow({
        where: { userId: root.id },
      });
      expect(stored.tokenHash).toBe(hashSessionToken(rawToken));
      expect(stored.tokenHash).not.toBe(rawToken);

      const me = await app.inject({
        headers: { cookie },
        method: 'GET',
        url: '/api/v1/auth/me',
      });
      expect(me.statusCode).toBe(200);
      expect(me.json().user).toEqual({
        email: 'root@example.com',
        id: root.id,
        nome: 'Root Admin',
        role: 'SUPER_ADMIN',
      });

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      await prisma.session.update({
        data: { createdAt: twoHoursAgo },
        where: { id: stored.id },
      });
      await prisma.session.update({
        data: { expiresAt: oneHourAgo },
        where: { id: stored.id },
      });
      const expired = await app.inject({
        headers: { cookie },
        method: 'GET',
        url: '/api/v1/auth/me',
      });
      expect(expired.statusCode).toBe(401);

      const secondLogin = await app.inject({
        method: 'POST',
        payload: { email: root.email, password },
        url: '/api/v1/auth/login',
      });
      const secondCookie = cookieFrom(secondLogin);
      const logout = await app.inject({
        headers: { cookie: secondCookie },
        method: 'POST',
        url: '/api/v1/auth/logout',
      });
      expect(logout.statusCode).toBe(204);
      expect(logout.headers['set-cookie']).toContain('Max-Age=0');
      const afterLogout = await app.inject({
        headers: { cookie: secondCookie },
        method: 'GET',
        url: '/api/v1/auth/me',
      });
      expect(afterLogout.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('enforces administrative role boundaries and inactive users', async () => {
    await bootstrap();
    const app = await buildApp({
      config,
      identityService: identity,
      logger: false,
    });

    try {
      const rootLogin = await app.inject({
        method: 'POST',
        payload: { email: 'root@example.com', password },
        url: '/api/v1/auth/login',
      });
      const rootCookie = cookieFrom(rootLogin);
      const adminCreation = await app.inject({
        headers: { cookie: rootCookie },
        method: 'POST',
        payload: {
          email: 'admin@example.com',
          nome: 'Admin',
          password,
          role: 'ADMIN',
        },
        url: '/api/v1/users',
      });
      expect(adminCreation.statusCode).toBe(201);
      expect(adminCreation.body).not.toContain('passwordHash');

      const adminLogin = await app.inject({
        method: 'POST',
        payload: { email: 'admin@example.com', password },
        url: '/api/v1/auth/login',
      });
      const adminCookie = cookieFrom(adminLogin);
      const forbiddenPromotion = await app.inject({
        headers: { cookie: adminCookie },
        method: 'POST',
        payload: {
          email: 'owner@example.com',
          nome: 'Owner',
          password,
          role: 'SUPER_ADMIN',
        },
        url: '/api/v1/users',
      });
      expect(forbiddenPromotion.statusCode).toBe(403);

      const operator = await app.inject({
        headers: { cookie: adminCookie },
        method: 'POST',
        payload: {
          email: 'operator@example.com',
          nome: 'Operator',
          password,
          role: 'OPERADOR',
        },
        url: '/api/v1/users',
      });
      expect(operator.statusCode).toBe(201);
      const operatorId = operator.json().id as string;
      const operatorLogin = await app.inject({
        method: 'POST',
        payload: { email: 'operator@example.com', password },
        url: '/api/v1/auth/login',
      });
      const operatorCookie = cookieFrom(operatorLogin);
      const forbiddenList = await app.inject({
        headers: { cookie: operatorCookie },
        method: 'GET',
        url: '/api/v1/users',
      });
      expect(forbiddenList.statusCode).toBe(403);

      const invalidId = await app.inject({
        headers: { cookie: rootCookie },
        method: 'GET',
        url: '/api/v1/users/not-a-uuid',
      });
      expect(invalidId.statusCode).toBe(400);

      const deactivated = await app.inject({
        headers: { cookie: adminCookie },
        method: 'PATCH',
        payload: { ativo: false },
        url: `/api/v1/users/${operatorId}/status`,
      });
      expect(deactivated.statusCode).toBe(200);
      const inactiveMe = await app.inject({
        headers: { cookie: operatorCookie },
        method: 'GET',
        url: '/api/v1/auth/me',
      });
      expect(inactiveMe.statusCode).toBe(401);
      const inactiveLogin = await app.inject({
        method: 'POST',
        payload: { email: 'operator@example.com', password },
        url: '/api/v1/auth/login',
      });
      expect(inactiveLogin.statusCode).toBe(401);

      const adminId = adminCreation.json().id as string;
      const roleChange = await app.inject({
        headers: { cookie: rootCookie },
        method: 'PATCH',
        payload: { role: 'GESTOR' },
        url: `/api/v1/users/${adminId}/role`,
      });
      expect(roleChange.statusCode).toBe(200);
      expect(roleChange.json().role).toBe('GESTOR');
      expect(
        (
          await app.inject({
            headers: { cookie: adminCookie },
            method: 'GET',
            url: '/api/v1/auth/me',
          })
        ).statusCode,
      ).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('invalidates other sessions after a password change', async () => {
    await bootstrap();
    const app = await buildApp({
      config,
      identityService: identity,
      logger: false,
    });

    try {
      const login = async () =>
        app.inject({
          method: 'POST',
          payload: { email: 'root@example.com', password },
          url: '/api/v1/auth/login',
        });
      const firstCookie = cookieFrom(await login());
      const secondCookie = cookieFrom(await login());
      const changed = await app.inject({
        headers: { cookie: firstCookie },
        method: 'POST',
        payload: {
          currentPassword: password,
          newPassword: 'nova frase senha muito segura',
        },
        url: '/api/v1/auth/change-password',
      });
      expect(changed.statusCode).toBe(204);
      expect(
        (
          await app.inject({
            headers: { cookie: secondCookie },
            method: 'GET',
            url: '/api/v1/auth/me',
          })
        ).statusCode,
      ).toBe(401);
      expect(
        (
          await app.inject({
            headers: { cookie: firstCookie },
            method: 'GET',
            url: '/api/v1/auth/me',
          })
        ).statusCode,
      ).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('limits repeated login attempts and emits Secure cookies in production', async () => {
    await bootstrap();
    const limitedConfig = configForTest({
      AUTH_LOGIN_RATE_LIMIT_MAX: '2',
      NODE_ENV: 'production',
    });
    const limitedIdentity = new IdentityService(prisma, limitedConfig);
    const app = await buildApp({
      config: limitedConfig,
      identityService: limitedIdentity,
      logger: false,
    });

    try {
      const attempt = () =>
        app.inject({
          method: 'POST',
          payload: {
            email: `missing-${randomUUID()}@example.com`,
            password: 'senha incorreta longa',
          },
          url: '/api/v1/auth/login',
        });
      expect((await attempt()).statusCode).toBe(401);
      expect((await attempt()).statusCode).toBe(401);
      const limited = await attempt();
      expect(limited.statusCode).toBe(429);
      expect(limited.json().error.code).toBe('TOO_MANY_REQUESTS');
    } finally {
      await app.close();
    }

    const secureApp = await buildApp({
      config: configForTest({ NODE_ENV: 'production' }),
      identityService: new IdentityService(
        prisma,
        configForTest({ NODE_ENV: 'production' }),
      ),
      logger: false,
    });
    try {
      const login = await secureApp.inject({
        method: 'POST',
        payload: { email: 'root@example.com', password },
        url: '/api/v1/auth/login',
      });
      expect(login.headers['set-cookie']).toContain('Secure');
      expect(login.headers['set-cookie']).toContain('__Host-');
    } finally {
      await secureApp.close();
    }
  });

  it('rejects untrusted mutation origins and database constraint violations', async () => {
    await bootstrap();
    const app = await buildApp({
      config,
      identityService: identity,
      logger: false,
    });

    try {
      const rejectedOrigin = await app.inject({
        headers: { origin: 'https://evil.example' },
        method: 'POST',
        payload: { email: 'root@example.com', password },
        url: '/api/v1/auth/login',
      });
      expect(rejectedOrigin.statusCode).toBe(403);

      await expect(
        prisma.user.create({
          data: {
            email: 'Uppercase@Example.com',
            nome: 'Constraint Probe',
            passwordHash: 'not-empty',
            role: 'OPERADOR',
          },
        }),
      ).rejects.toThrow();

      const user = await prisma.user.create({
        data: {
          email: 'constraint@example.com',
          nome: 'Constraint Probe',
          passwordHash: 'not-empty',
          role: 'OPERADOR',
        },
      });
      await expect(
        prisma.session.create({
          data: {
            expiresAt: new Date(Date.now() + 60_000),
            tokenHash: 'raw-token-is-not-a-hash',
            userId: user.id,
          },
        }),
      ).rejects.toThrow();
    } finally {
      await app.close();
    }
  });
});
