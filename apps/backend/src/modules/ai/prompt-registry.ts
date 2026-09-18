import type { AiPromptDefinition, AiPromptId } from '@larcarvalho/shared';

export const PROMPT_REGISTRY: Readonly<Record<AiPromptId, AiPromptDefinition>> =
  Object.freeze({
    'commercial-copilot': {
      id: 'commercial-copilot',
      outputSchema: 'aiStructuredResponseSchema',
      purpose:
        'Copiloto comercial geral: orientar o vendedor com base apenas em dados autorizados já carregados no contexto.',
      requiredContext: ['GENERAL'],
      version: 'v1',
    },
    'comparison-analysis': {
      id: 'comparison-analysis',
      outputSchema: 'aiStructuredResponseSchema',
      purpose:
        'Explicar diferenças entre até 5 alternativas já calculadas, sem inventar contemplação ou probabilidade.',
      requiredContext: ['COMPARATOR'],
      version: 'v1',
    },
    'follow-up-draft': {
      id: 'follow-up-draft',
      outputSchema: 'aiStructuredResponseSchema',
      purpose:
        'Gerar rascunho de mensagem comercial (follow-up, WhatsApp, e-mail) para revisão humana.',
      requiredContext: ['GENERAL', 'LEAD'],
      version: 'v1',
    },
    'lead-analysis': {
      id: 'lead-analysis',
      outputSchema: 'aiStructuredResponseSchema',
      purpose:
        'Resumir lead autorizado: dados conhecidos, dados ausentes, próximas perguntas e próxima ação sugerida.',
      requiredContext: ['LEAD'],
      version: 'v1',
    },
    'manager-summary': {
      id: 'manager-summary',
      outputSchema: 'aiStructuredResponseSchema',
      purpose:
        'Resumir funil e carteira da equipe autorizada, sem expor dados fora do escopo TEAM/ALL.',
      requiredContext: ['DASHBOARD', 'COMMERCIAL_MANAGEMENT'],
      version: 'v1',
    },
    'simulation-explanation': {
      id: 'simulation-explanation',
      outputSchema: 'aiStructuredResponseSchema',
      purpose:
        'Explicar resultado determinístico já calculado (crédito, parcelas, aderência), sem recalcular valores.',
      requiredContext: ['SIMULATION'],
      version: 'v1',
    },
    'customer-360': {
      id: 'customer-360',
      outputSchema: 'aiStructuredResponseSchema',
      purpose:
        'Visão 360 do cliente: perfil, jornada, simulações, propostas, follow-ups, dados faltantes e próxima ação, sempre a partir de registros autorizados.',
      requiredContext: ['LEAD'],
      version: 'v1',
    },
    'my-day': {
      id: 'my-day',
      outputSchema: 'aiStructuredResponseSchema',
      purpose:
        'Agenda do dia: atrasados, hoje e próximos a partir de regras determinísticas, com sequência de atendimento explicável e sem score oculto.',
      requiredContext: ['GENERAL', 'DASHBOARD'],
      version: 'v1',
    },
    'sale-summary': {
      id: 'sale-summary',
      outputSchema: 'aiStructuredResponseSchema',
      purpose:
        'Resumir venda autorizada: status, documentos faltantes, contrato e divergência de comissão já calculada. Nunca calcular comissão, taxa, crédito, parcela ou valor recebido; apenas interpretar fatos.',
      requiredContext: ['SALE'],
      version: 'v1',
    },
    'knowledge-grounded-answer': {
      id: 'knowledge-grounded-answer',
      outputSchema: 'aiStructuredResponseSchema',
      purpose:
        'Responder perguntas usando exclusivamente evidências recuperadas da base de conhecimento autorizada, citando documento, seção e página. Sem evidência suficiente, informar que a informação não foi encontrada nas fontes; nunca inventar regra, taxa, prazo ou lance.',
      requiredContext: ['KNOWLEDGE'],
      version: 'v1',
    },
    'integration-analysis': {
      id: 'integration-analysis',
      outputSchema: 'aiStructuredResponseSchema',
      purpose:
        'Explicar integrações autorizadas a partir de fatos do backend: status, runs, issues e mapping. Usar somente fatos; diferenciar erro observado de hipótese; nunca exibir segredos, recomendar bypass ou inventar API/campo de administradora.',
      requiredContext: ['GENERAL', 'DASHBOARD'],
      version: 'v1',
    },
  });

export function getPromptDefinition(id: AiPromptId): AiPromptDefinition {
  return PROMPT_REGISTRY[id];
}

export function listPromptDefinitions(): readonly AiPromptDefinition[] {
  return Object.values(PROMPT_REGISTRY);
}
