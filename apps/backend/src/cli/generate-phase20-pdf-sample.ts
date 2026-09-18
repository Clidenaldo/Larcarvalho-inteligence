import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { CommercialConfiguration, Proposal } from '@larcarvalho/shared';

import { ProposalPdfService } from '../modules/proposals/proposal-pdf.service.js';

const now = new Date('2026-09-07T12:00:00.000Z').toISOString();
const result = {
  badges: [],
  calculationStatus: 'COMPLETE' as const,
  calculationWarnings: [],
  ruleVersion: 'LC-1',
  sourceDataUpdatedAt: now,
  administratorId: '20000000-0000-4000-8000-000000000010',
  administratorName: 'Administradora Demonstração',
  productId: '20000000-0000-4000-8000-000000000020',
  productName: 'Produto Imóvel Demonstração',
  groupId: null,
  groupCode: null,
  quotaId: null,
  quotaNumber: null,
  category: 'IMOVEL' as const,
  contractedCredit: '200000.00',
  netCredit: '180000.00',
  totalTermMonths: 120,
  remainingTermMonths: 120,
  initialInstallment: '1966.67',
  reducedInstallment: '983.34',
  laterInstallment: '1966.67',
  ownBidAmount: '10000.00',
  embeddedBidAmount: '20000.00',
  totalBidAmount: '30000.00',
  totalBidPercent: '15.0000',
  administrationFee: '30000.00',
  reserveFund: '4000.00',
  insurance: '0.00',
  adhesionFee: '0.00',
  adherenceScore: 100,
  assumptions: [
    'Cálculo executado exclusivamente com regra comercial configurada.',
    'Parcela reduzida válida somente até a contemplação.',
  ],
};
const proposal: Proposal = {
  id: '20000000-0000-4000-8000-000000000100',
  number: 'PROP-20260907-DEMO',
  parentId: null,
  simulationId: '20000000-0000-4000-8000-000000000101',
  createdById: '20000000-0000-4000-8000-000000000102',
  sellerName: 'Consultora Larcarvalho',
  leadId: '20000000-0000-4000-8000-000000000103',
  clientName: 'Cliente Demonstração',
  status: 'GENERATED',
  title: 'Proposta personalizada para aquisição de imóvel',
  objectiveSummary:
    'Aquisição planejada de imóvel com crédito líquido de R$ 180.000 e horizonte de 120 meses.',
  notes:
    'Valores demonstrativos. A contratação depende da análise e confirmação das condições pela administradora.',
  version: 1,
  issuedAt: now,
  validUntil: new Date('2026-09-14T12:00:00.000Z').toISOString(),
  createdAt: now,
  updatedAt: now,
  items: [
    {
      id: '20000000-0000-4000-8000-000000000104',
      resultId: '20000000-0000-4000-8000-000000000105',
      position: 1,
      description: 'Administradora Demonstração - Produto Imóvel',
      financialSnapshot: result,
    },
  ],
  statusHistory: [],
};
const configuration: CommercialConfiguration = {
  id: '20000000-0000-4000-8000-000000000001',
  organizationName: 'Larcarvalho Consórcios',
  currency: 'BRL',
  roundingMode: 'HALF_UP',
  proposalValidityDays: 7,
  ruleVersionPrefix: 'LC',
  requiredDisclaimer:
    'Esta simulação é informativa e utiliza exclusivamente regras comerciais configuradas. Confirme as condições vigentes antes da contratação.',
  active: true,
  version: 1,
  createdAt: now,
  updatedAt: now,
};

const outputDirectory = resolve(process.cwd(), '../../output/pdf');
await mkdir(outputDirectory, { recursive: true });
const output = resolve(outputDirectory, 'proposta-fase20-demonstracao.pdf');
await writeFile(
  output,
  await new ProposalPdfService().generate(proposal, configuration),
);
console.info(output);
