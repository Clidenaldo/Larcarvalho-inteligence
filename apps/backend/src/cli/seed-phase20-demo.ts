import '../config/load-env.js';

import { parseEnvironment } from '../config/env.js';
import { createPrismaClient } from '../infrastructure/database/prisma-client.js';

const url = process.env.TEST_DATABASE_URL;
if (!url)
  throw new Error(
    'TEST_DATABASE_URL é obrigatória para o seed de demonstração',
  );
const target = new URL(url);
if (
  !['localhost', '127.0.0.1'].includes(target.hostname) ||
  target.pathname.slice(1) !== 'larcarvalho_test'
)
  throw new Error(
    'O seed da Fase 20 só pode usar o banco local larcarvalho_test',
  );

const db = createPrismaClient(
  parseEnvironment({ ...process.env, DATABASE_URL: url, NODE_ENV: 'test' }),
);

try {
  const administrator = await db.administradora.upsert({
    where: { id: '20000000-0000-4000-8000-000000000010' },
    update: { nome: 'Administradora Demonstração Fase 20', ativa: true },
    create: {
      id: '20000000-0000-4000-8000-000000000010',
      nome: 'Administradora Demonstração Fase 20',
      ativa: true,
    },
  });
  const product = await db.produto.upsert({
    where: { id: '20000000-0000-4000-8000-000000000020' },
    update: { nome: 'Produto Imóvel Demonstração', ativo: true },
    create: {
      id: '20000000-0000-4000-8000-000000000020',
      administradoraId: administrator.id,
      nome: 'Produto Imóvel Demonstração',
      categoria: 'IMOVEL',
      ativo: true,
    },
  });
  await db.commercialConfiguration.upsert({
    where: { id: '20000000-0000-4000-8000-000000000001' },
    update: { active: true },
    create: {
      id: '20000000-0000-4000-8000-000000000001',
      requiredDisclaimer:
        'Esta simulação é informativa e utiliza exclusivamente regras comerciais configuradas.',
    },
  });
  await db.productCommercialRule.upsert({
    where: { id: '20000000-0000-4000-8000-000000000030' },
    update: { active: true, deletedAt: null },
    create: {
      id: '20000000-0000-4000-8000-000000000030',
      administradoraId: administrator.id,
      produtoId: product.id,
      category: 'IMOVEL',
      name: 'Regra completa de demonstração',
      version: 1,
      validFrom: new Date('2026-01-01T00:00:00.000Z'),
      administrationFeePercent: '15',
      reserveFundPercent: '2',
      insurancePercent: '0',
      adhesionFeePercent: '0',
      maxEmbeddedBidPercent: '30',
      minimumTermMonths: 60,
      maximumTermMonths: 240,
      reducedInstallmentPercent: '50',
      reducedUntilContemplation: true,
      inProgressAllowed: true,
      structuredOperationEligible: true,
      notes: 'Dados exclusivamente demonstrativos.',
    },
  });
  console.info('Seed demonstrativo da Fase 20 concluído no banco de testes.');
} finally {
  await db.$disconnect();
}
