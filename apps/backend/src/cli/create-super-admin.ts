import '../config/load-env.js';

import { createUserRequestSchema } from '@larcarvalho/shared';

import { parseEnvironment } from '../config/env.js';
import {
  disconnectPrismaClient,
  getPrismaClient,
} from '../infrastructure/database/prisma-client.js';
import { IdentityService } from '../modules/identity/identity.service.js';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const config = parseEnvironment();
  if (!config.DATABASE_URL) {
    throw new Error('DATABASE_URL é obrigatória');
  }

  const input = createUserRequestSchema.parse({
    email: argument('email') ?? process.env.FIRST_SUPER_ADMIN_EMAIL,
    nome: argument('nome') ?? process.env.FIRST_SUPER_ADMIN_NAME,
    password: process.env.FIRST_SUPER_ADMIN_PASSWORD,
    role: 'SUPER_ADMIN',
  });
  const service = new IdentityService(getPrismaClient(config), config);
  const user = await service.createFirstSuperAdmin(input);
  process.stdout.write(
    `SUPER_ADMIN criado: ${user.nome} <${user.email}> (${user.id})\n`,
  );
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : 'Falha inesperada';
  process.stderr.write(`Não foi possível criar o SUPER_ADMIN: ${message}\n`);
  process.exitCode = 1;
} finally {
  await disconnectPrismaClient();
}
