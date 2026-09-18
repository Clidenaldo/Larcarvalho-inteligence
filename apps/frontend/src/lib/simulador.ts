import type { SimuladorPublicoPerfil } from '@larcarvalho/shared';

export function normalizeBrlInput(value: string): string | null {
  const cleaned = value
    .trim()
    .replace(/^R\$\s?/, '')
    .replace(/\s/g, '');
  if (!cleaned || cleaned.startsWith('-')) return null;
  let normalized: string;
  if (cleaned.includes(','))
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned))
    normalized = cleaned.replace(/\./g, '');
  else normalized = cleaned;
  return /^\d+(\.\d{1,2})?$/.test(normalized) && Number(normalized) > 0
    ? normalized
    : null;
}

export function buildWhatsAppLink(
  configuredNumber: string | null,
  profile: SimuladorPublicoPerfil,
  group?: string,
): string | null {
  if (!configuredNumber || !/^\d{8,15}$/.test(configuredNumber)) return null;
  const parts = [
    'Olá, fiz uma simulação na Larcarvalho Consórcios e gostaria de falar sobre uma opção de consórcio.',
    `Categoria: ${profile.categoria}.`,
    `Crédito desejado: R$ ${Number(profile.valorCreditoDesejado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`,
    ...(group
      ? [
          `Grupo consultado: ${group.replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 80)}.`,
        ]
      : []),
  ];
  return `https://wa.me/${configuredNumber}?text=${encodeURIComponent(parts.join(' '))}`;
}
