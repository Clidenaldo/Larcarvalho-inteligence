import type { CommercialConfiguration, Proposal } from '@larcarvalho/shared';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFPage,
  type PDFFont,
} from 'pdf-lib';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const GREEN = rgb(0.035, 0.33, 0.24);
const TEXT = rgb(0.12, 0.16, 0.2);
const MUTED = rgb(0.38, 0.43, 0.47);
const LIGHT = rgb(0.93, 0.97, 0.95);

const brl = (value: string | null) =>
  value === null
    ? 'Não disponível'
    : new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(Number(value));

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  let current = '';
  for (const word of text.replace(/\s+/g, ' ').trim().split(' ')) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) current = candidate;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function footer(
  page: PDFPage,
  font: PDFFont,
  proposal: Proposal,
  pageNumber: number,
) {
  page.drawLine({
    start: { x: MARGIN, y: 34 },
    end: { x: PAGE_WIDTH - MARGIN, y: 34 },
    thickness: 0.5,
    color: rgb(0.8, 0.83, 0.82),
  });
  page.drawText(`Proposta ${proposal.number} - versão ${proposal.version}`, {
    x: MARGIN,
    y: 20,
    size: 8,
    font,
    color: MUTED,
  });
  page.drawText(`Página ${pageNumber}`, {
    x: PAGE_WIDTH - MARGIN - 45,
    y: 20,
    size: 8,
    font,
    color: MUTED,
  });
}

export class ProposalPdfService {
  async generate(
    proposal: Proposal,
    configuration: CommercialConfiguration,
    options: { readonly detail: 'full' | 'summary' } = { detail: 'full' },
  ) {
    const document = await PDFDocument.create();
    const regular = await document.embedFont(StandardFonts.Helvetica);
    const bold = await document.embedFont(StandardFonts.HelveticaBold);
    let page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;
    let pageNumber = 1;
    const newPage = () => {
      footer(page, regular, proposal, pageNumber);
      page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      pageNumber += 1;
      y = PAGE_HEIGHT - MARGIN;
    };
    const ensure = (height: number) => {
      if (y - height < 50) newPage();
    };
    const text = (
      value: string,
      options: {
        size?: number;
        bold?: boolean;
        color?: ReturnType<typeof rgb>;
        gap?: number;
      } = {},
    ) => {
      const size = options.size ?? 10;
      const selectedFont = options.bold ? bold : regular;
      const lines = wrap(value, selectedFont, size, PAGE_WIDTH - MARGIN * 2);
      ensure(lines.length * (size + 3) + (options.gap ?? 5));
      for (const line of lines) {
        page.drawText(line, {
          x: MARGIN,
          y,
          size,
          font: selectedFont,
          color: options.color ?? TEXT,
        });
        y -= size + 3;
      }
      y -= options.gap ?? 5;
    };

    page.drawRectangle({
      x: 0,
      y: PAGE_HEIGHT - 112,
      width: PAGE_WIDTH,
      height: 112,
      color: GREEN,
    });
    page.drawText(configuration.organizationName, {
      x: MARGIN,
      y: PAGE_HEIGHT - 62,
      size: 22,
      font: bold,
      color: rgb(1, 1, 1),
    });
    page.drawText('Proposta comercial de consórcio', {
      x: MARGIN,
      y: PAGE_HEIGHT - 84,
      size: 11,
      font: regular,
      color: rgb(0.87, 0.96, 0.92),
    });
    y = PAGE_HEIGHT - 145;
    text(proposal.title, { size: 17, bold: true, gap: 10 });
    text(`Proposta: ${proposal.number}`, { bold: true, gap: 2 });
    text(`Cliente: ${proposal.clientName}`, { gap: 2 });
    text(`Consultor responsável: ${proposal.sellerName}`, { gap: 2 });
    text(
      `Emissão: ${new Date(proposal.issuedAt ?? proposal.createdAt).toLocaleDateString('pt-BR')} | Validade: ${new Date(proposal.validUntil).toLocaleDateString('pt-BR')}`,
      { gap: 14 },
    );
    page.drawRectangle({
      x: MARGIN,
      y: y - 8,
      width: PAGE_WIDTH - MARGIN * 2,
      height: 30,
      color: LIGHT,
    });
    y += 2;
    text('Objetivo do cliente', { bold: true, color: GREEN, gap: 5 });
    text(proposal.objectiveSummary, { gap: 14 });

    proposal.items.forEach((item, index) => {
      ensure(245);
      text(`Cenário ${index + 1} - ${item.description}`, {
        size: 14,
        bold: true,
        color: GREEN,
        gap: 8,
      });
      const value = item.financialSnapshot;
      const rows: Array<readonly [string, string]> = [
        ['Administradora', value.administratorName],
        [
          'Produto / grupo / cota',
          [value.productName, value.groupCode, value.quotaNumber]
            .filter(Boolean)
            .join(' / ') || 'Regra por categoria',
        ],
        ['Categoria', value.category],
        [
          'Prazo total / restante',
          `${value.totalTermMonths ?? '-'} / ${value.remainingTermMonths ?? '-'} meses`,
        ],
      ];
      if (options.detail === 'full') {
        rows.push(
          ['Crédito contratado', brl(value.contractedCredit)],
          ['Crédito líquido pós-contemplação', brl(value.netCredit)],
          ['Parcela inicial', brl(value.initialInstallment)],
          ['Parcela reduzida', brl(value.reducedInstallment)],
          ['Parcela posterior', brl(value.laterInstallment)],
          [
            'Lance próprio / embutido / total',
            `${brl(value.ownBidAmount)} / ${brl(value.embeddedBidAmount)} / ${brl(value.totalBidAmount)} (${value.totalBidPercent ?? '-'}%)`,
          ],
          [
            'Taxa adm. / fundo / seguro / adesão',
            `${brl(value.administrationFee)} / ${brl(value.reserveFund)} / ${brl(value.insurance)} / ${brl(value.adhesionFee)}`,
          ],
        );
      }
      rows.push([
        'Regra e fonte',
        `${value.ruleVersion} - dados de ${new Date(value.sourceDataUpdatedAt).toLocaleString('pt-BR')}`,
      ]);
      for (const [label, content] of rows) {
        ensure(22);
        page.drawText(label, {
          x: MARGIN,
          y,
          size: 8.5,
          font: bold,
          color: MUTED,
        });
        const valueLines = wrap(content, regular, 9, 300);
        valueLines.forEach((line, lineIndex) =>
          page.drawText(line, {
            x: 245,
            y: y - lineIndex * 11,
            size: 9,
            font: regular,
            color: TEXT,
          }),
        );
        y -= Math.max(18, valueLines.length * 11 + 5);
      }
      if (options.detail === 'summary') {
        text(
          'Valores completos de crédito, parcelas, lances e taxas são apresentados pelo consultor responsável.',
          { size: 8.5, color: MUTED, gap: 12 },
        );
      } else {
        text(`Premissas: ${value.assumptions.join(' ')}`, {
          size: 8.5,
          color: MUTED,
          gap: 12,
        });
      }
    });

    text('Observações e condições', {
      size: 13,
      bold: true,
      color: GREEN,
      gap: 6,
    });
    if (proposal.notes) text(proposal.notes, { size: 9, gap: 7 });
    text(configuration.requiredDisclaimer, { size: 9, bold: true, gap: 5 });
    text(
      'A contemplação depende das regras vigentes da administradora e das deliberações de cada assembleia. Esta proposta não constitui promessa ou garantia de contemplação.',
      { size: 9, color: MUTED },
    );
    footer(page, regular, proposal, pageNumber);
    document.setTitle(`${proposal.number} - ${proposal.clientName}`);
    document.setAuthor(configuration.organizationName);
    document.setSubject('Proposta comercial de consórcio');
    document.setCreationDate(new Date(proposal.createdAt));
    return Buffer.from(await document.save());
  }
}
