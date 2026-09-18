import type {
  ComparadorGroup,
  IndiceAderenciaComponent,
  IndiceAderenciaResult,
  PerfilAderencia,
} from '@larcarvalho/shared';
import { Prisma } from '../../generated/prisma/client.js';

export const INDICE_ADERENCIA_CONFIG = Object.freeze({
  pesos: Object.freeze({
    CREDITO: 20,
    PARCELA: 15,
    PRAZO: 10,
    HISTORICO_LANCES: 25,
    COBERTURA_HISTORICA: 10,
    CARACTERISTICAS_GRUPO: 10,
    QUALIDADE_DADOS: 10,
  }),
  coberturaMinima: 40,
});

const totalConfiguredWeight = Object.values(
  INDICE_ADERENCIA_CONFIG.pesos,
).reduce((sum, weight) => sum + weight, 0);
if (totalConfiguredWeight !== 100)
  throw new Error('Os pesos do Índice de Aderência devem somar 100');

type DecimalInput = string | number | Prisma.Decimal;
const D = (value: DecimalInput) => new Prisma.Decimal(value);
const round = (value: DecimalInput, places = 2) =>
  D(value).toDecimalPlaces(places, Prisma.Decimal.ROUND_HALF_UP).toNumber();
const clamp = (value: Prisma.Decimal, minimum = 0, maximum = 100) =>
  Prisma.Decimal.max(minimum, Prisma.Decimal.min(maximum, value));
const statusFor = (score: number): IndiceAderenciaComponent['status'] =>
  score === 100 ? 'ATENDE' : score === 0 ? 'NAO_ATENDE' : 'PARCIAL';
const unavailable = (
  nome: IndiceAderenciaComponent['nome'],
  explicacao: string,
): IndiceAderenciaComponent => ({
  nome,
  peso: INDICE_ADERENCIA_CONFIG.pesos[nome],
  pesoAvaliado: 0,
  pontuacaoBruta: null,
  pontuacaoPonderada: null,
  status: 'INDISPONIVEL',
  explicacao,
  dadosUtilizados: {},
});
const evaluated = (
  nome: IndiceAderenciaComponent['nome'],
  rawScore: DecimalInput,
  explicacao: string,
  dadosUtilizados: Record<string, string | null>,
  evaluatedWeightFactor: DecimalInput = 1,
): IndiceAderenciaComponent => {
  const score = round(clamp(D(rawScore)));
  const weight = INDICE_ADERENCIA_CONFIG.pesos[nome];
  const evaluatedWeight = round(D(weight).mul(evaluatedWeightFactor));
  return {
    nome,
    peso: weight,
    pesoAvaliado: evaluatedWeight,
    pontuacaoBruta: score,
    pontuacaoPonderada: round(D(score).mul(evaluatedWeight).div(100)),
    status: statusFor(score),
    explicacao,
    dadosUtilizados,
  };
};

export function calculateCreditoComponent(
  perfil: PerfilAderencia,
  grupo: ComparadorGroup,
): IndiceAderenciaComponent {
  const desired = perfil.valorCreditoDesejado;
  if (!desired)
    return unavailable('CREDITO', 'Crédito desejado não foi informado.');
  if (!grupo.credito.minimo || !grupo.credito.maximo)
    return unavailable(
      'CREDITO',
      'A faixa de crédito do grupo não está disponível.',
    );
  const value = D(desired);
  const meets =
    value.gte(grupo.credito.minimo) && value.lte(grupo.credito.maximo);
  return evaluated(
    'CREDITO',
    meets ? 100 : 0,
    meets
      ? 'O crédito desejado está dentro da faixa conhecida do grupo.'
      : 'O crédito desejado está fora da faixa conhecida do grupo.',
    {
      valorCreditoDesejado: desired,
      creditoMinimo: grupo.credito.minimo,
      creditoMaximo: grupo.credito.maximo,
    },
  );
}

export function calculateParcelaComponent(
  perfil: PerfilAderencia,
  grupo: ComparadorGroup,
): IndiceAderenciaComponent {
  if (!perfil.parcelaMaxima)
    return unavailable('PARCELA', 'Parcela máxima não foi informada.');
  if (!grupo.parcela.valorConhecido)
    return unavailable('PARCELA', 'O grupo não possui parcela conhecida.');
  const meets = D(grupo.parcela.valorConhecido).lte(perfil.parcelaMaxima);
  return evaluated(
    'PARCELA',
    meets ? 100 : 0,
    meets
      ? 'A parcela conhecida não excede o limite informado.'
      : 'A parcela conhecida excede o limite informado.',
    {
      parcelaMaxima: perfil.parcelaMaxima,
      parcelaConhecida: grupo.parcela.valorConhecido,
      origem: grupo.parcela.origem,
    },
  );
}

export function calculatePrazoComponent(
  perfil: PerfilAderencia,
  grupo: ComparadorGroup,
): IndiceAderenciaComponent {
  if (perfil.prazoMinimo === undefined && perfil.prazoMaximo === undefined)
    return unavailable('PRAZO', 'Prazo mínimo ou máximo não foi informado.');
  if (grupo.prazo.totalMeses === null)
    return unavailable('PRAZO', 'O prazo total do grupo não está disponível.');
  const meets =
    (perfil.prazoMinimo === undefined ||
      grupo.prazo.totalMeses >= perfil.prazoMinimo) &&
    (perfil.prazoMaximo === undefined ||
      grupo.prazo.totalMeses <= perfil.prazoMaximo);
  return evaluated(
    'PRAZO',
    meets ? 100 : 0,
    meets
      ? 'O prazo total está dentro do intervalo informado.'
      : 'O prazo total está fora do intervalo informado.',
    {
      prazoMinimo: perfil.prazoMinimo?.toString() ?? null,
      prazoMaximo: perfil.prazoMaximo?.toString() ?? null,
      prazoGrupo: grupo.prazo.totalMeses.toString(),
    },
  );
}

export function calculateLanceComponent(
  perfil: PerfilAderencia,
  grupo: ComparadorGroup,
): IndiceAderenciaComponent {
  const available = perfil.lanceDisponivelPercentual;
  if (!available)
    return unavailable(
      'HISTORICO_LANCES',
      'Lance disponível percentual não foi informado.',
    );
  const minimum = grupo.historico.percentualLanceMinimo;
  const median = grupo.historico.percentualLanceMediano;
  const observations = grupo.historico.lancesContemplados;
  if (!minimum || !median || !observations)
    return unavailable(
      'HISTORICO_LANCES',
      'O histórico de lances contemplados é insuficiente para comparação.',
    );
  const bid = D(available);
  const min = D(minimum);
  const med = D(median);
  let score: Prisma.Decimal;
  if (bid.gte(med)) score = D(100);
  else if (bid.gte(min)) {
    score = med.eq(min)
      ? D(100)
      : D(50).add(bid.sub(min).div(med.sub(min)).mul(50));
  } else score = min.eq(0) ? D(0) : bid.div(min).mul(50);
  const observationFactor =
    observations === 1 ? 0.5 : observations < 5 ? 0.75 : 1;
  return evaluated(
    'HISTORICO_LANCES',
    score,
    'O lance informado foi comparado à mediana e ao mínimo históricos observados. Isso não representa garantia de contemplação.',
    {
      lanceDisponivelPercentual: available,
      minimoHistorico: minimum,
      medianaHistorica: median,
      maximoHistorico: grupo.historico.percentualLanceMaximo,
      observacoes: observations.toString(),
    },
    observationFactor,
  );
}

export function calculateCoberturaComponent(
  grupo: ComparadorGroup,
): IndiceAderenciaComponent {
  const total = grupo.cobertura.assembleiasRealizadas;
  const bids = grupo.cobertura.assembleiasComDadosLance;
  const awards = grupo.cobertura.assembleiasComDadosContemplacao;
  if (!grupo.historico.snapshotId || !total || bids === null || awards === null)
    return unavailable(
      'COBERTURA_HISTORICA',
      'Não há snapshot com assembleias suficientes para avaliar cobertura.',
    );
  const bidRatio = clamp(D(bids).div(total), 0, 1);
  const awardRatio = clamp(D(awards).div(total), 0, 1);
  const score = bidRatio.add(awardRatio).div(2).mul(100);
  return evaluated(
    'COBERTURA_HISTORICA',
    score,
    'A cobertura combina, em partes iguais, assembleias com dados de lance e de contemplação.',
    {
      assembleiasRealizadas: total.toString(),
      assembleiasComDadosLance: bids.toString(),
      assembleiasComDadosContemplacao: awards.toString(),
    },
  );
}

export function calculateCaracteristicasComponent(): IndiceAderenciaComponent {
  return unavailable(
    'CARACTERISTICAS_GRUPO',
    'Não existe nesta fase uma preferência adicional do cliente que permita pontuar características sem duplicar outros componentes.',
  );
}

export function calculateQualidadeComponent(
  grupo: ComparadorGroup,
): IndiceAderenciaComponent {
  const critical = grupo.qualidade.issuesCriticas;
  const openNonCritical = Math.max(0, grupo.qualidade.issuesAbertas - critical);
  const score = critical
    ? Math.max(0, 50 - critical * 25 - openNonCritical * 5)
    : Math.max(0, 100 - openNonCritical * 10);
  return evaluated(
    'QUALIDADE_DADOS',
    score,
    'A pontuação reflete somente pendências técnicas abertas e críticas dos dados, não a qualidade comercial do grupo.',
    {
      issuesAbertas: grupo.qualidade.issuesAbertas.toString(),
      issuesCriticas: critical.toString(),
    },
  );
}

const classification = (
  index: number,
): IndiceAderenciaResult['classificacao'] =>
  index >= 80
    ? 'ALTA_ADERENCIA'
    : index >= 60
      ? 'ADERENCIA_MODERADA'
      : index >= 40
        ? 'BAIXA_ADERENCIA'
        : 'MUITO_BAIXA_ADERENCIA';

export function calculateIndiceAderencia(
  perfil: PerfilAderencia,
  grupo: ComparadorGroup,
): IndiceAderenciaResult {
  const componentes = [
    calculateCreditoComponent(perfil, grupo),
    calculateParcelaComponent(perfil, grupo),
    calculatePrazoComponent(perfil, grupo),
    calculateLanceComponent(perfil, grupo),
    calculateCoberturaComponent(grupo),
    calculateCaracteristicasComponent(),
    calculateQualidadeComponent(grupo),
  ];
  const evaluable = round(
    componentes.reduce((sum, item) => sum.add(item.pesoAvaliado), D(0)),
  );
  const obtained = componentes.reduce(
    (sum, item) => sum.add(item.pontuacaoPonderada ?? 0),
    D(0),
  );
  const index =
    evaluable >= INDICE_ADERENCIA_CONFIG.coberturaMinima
      ? round(obtained.div(evaluable).mul(100), 0)
      : null;
  return {
    grupoId: grupo.grupo.id,
    indice: index,
    classificacao: index === null ? null : classification(index),
    coberturaAvaliacao: evaluable,
    pesoTotalAvaliavel: evaluable,
    componentes,
    disclaimer:
      'O Índice de Aderência mede compatibilidade entre os critérios informados e os dados conhecidos do grupo. Ele não representa probabilidade, promessa ou garantia de contemplação.',
  };
}
