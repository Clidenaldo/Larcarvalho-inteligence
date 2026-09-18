import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { apiPrefix } from '@larcarvalho/shared';
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';
import multipart from '@fastify/multipart';

import { type AppConfig, parseEnvironment } from './config/env.js';
import { createLoggerOptions } from './config/logger.js';
import { registerAuthContext } from './core/auth/http-auth.js';
import type { ReadinessProbe } from './core/readiness/readiness-probe.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerRequestContext } from './plugins/request-context.js';
import { registerSecurityPlugins } from './plugins/security.js';
import { technicalRoutes } from './routes/technical.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { administradorasRoutes } from './modules/administradoras/administradoras.routes.js';
import { AdministradorasService } from './modules/administradoras/administradoras.service.js';
import { CotasService } from './modules/cotas/cotas.service.js';
import { AssembleiasService } from './modules/assembleias/assembleias.service.js';
import { ContemplacoesService } from './modules/contemplacoes/contemplacoes.service.js';
import { GruposService } from './modules/grupos/grupos.service.js';
import { IdentityService } from './modules/identity/identity.service.js';
import { historicoRoutes } from './modules/historico.routes.js';
import { LancesService } from './modules/lances/lances.service.js';
import { operacionalRoutes } from './modules/operacional.routes.js';
import { ProdutosService } from './modules/produtos/produtos.service.js';
import { usersRoutes, teamsRoutes } from './modules/users/users.routes.js';
import { getPrismaClient } from './infrastructure/database/prisma-client.js';
import { ImportacoesService } from './modules/importacoes/importacoes.service.js';
import { importacoesRoutes } from './modules/importacoes/importacoes.routes.js';
import { IMPORT_MAX_BYTES } from './modules/importacoes/import-file.js';
import { DataQualityService } from './modules/data-quality/data-quality.service.js';
import { dataQualityRoutes } from './modules/data-quality/data-quality.routes.js';
import { GrupoHistoricoService } from './modules/grupo-historico/grupo-historico.service.js';
import { grupoHistoricoRoutes } from './modules/grupo-historico/grupo-historico.routes.js';
import { ComparadorService } from './modules/comparador/comparador.service.js';
import { comparadorRoutes } from './modules/comparador/comparador.routes.js';
import { IndiceAderenciaService } from './modules/indice-aderencia/indice-aderencia.service.js';
import { indiceAderenciaRoutes } from './modules/indice-aderencia/indice-aderencia.routes.js';
import { SimuladorPublicoService } from './modules/simulador-publico/simulador-publico.service.js';
import { simuladorPublicoRoutes } from './modules/simulador-publico/simulador-publico.routes.js';
import { LeadsService } from './modules/leads/leads.service.js';
import {
  leadsRoutes,
  publicLeadsRoutes,
} from './modules/leads/leads.routes.js';
import { IntegrationsRepository } from './modules/integrations/integrations.repository.js';
import { IntegrationsService } from './modules/integrations/integrations.service.js';
import { integrationsRoutes } from './modules/integrations/integrations.routes.js';
import { DashboardRepository } from './modules/dashboard/dashboard.repository.js';
import { DashboardService } from './modules/dashboard/dashboard.service.js';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.js';
import { registerHttpMetrics } from './infrastructure/observability/http-metrics.js';
import { metricsRoutes } from './routes/metrics.routes.js';
import { AnalyticsService } from './modules/analytics/analytics.service.js';
import {
  analyticsRoutes,
  publicAnalyticsRoutes,
} from './modules/analytics/analytics.routes.js';
import { TabelasComerciaisService } from './modules/tabelas-comerciais/tabelas-comerciais.service.js';
import { tabelasComerciaisRoutes } from './modules/tabelas-comerciais/tabelas-comerciais.routes.js';
import { SimulationsService } from './modules/simulations/simulations.service.js';
import { simulationsRoutes } from './modules/simulations/simulations.routes.js';
import { CommercialConfigurationsService } from './modules/commercial-configurations/commercial-configurations.service.js';
import {
  commercialConfigurationRoutes,
  productCommercialRulesRoutes,
} from './modules/commercial-configurations/commercial-configurations.routes.js';
import { ProposalsService } from './modules/proposals/proposals.service.js';
import {
  proposalsRoutes,
  simulationProposalsRoutes,
} from './modules/proposals/proposals.routes.js';
import { AgendaService } from './modules/agenda/agenda.service.js';
import { agendaRoutes } from './modules/agenda/agenda.routes.js';
import { FollowUpsService } from './modules/follow-ups/follow-ups.service.js';
import { followUpsRoutes } from './modules/follow-ups/follow-ups.routes.js';
import { PortfolioService } from './modules/portfolio/portfolio.service.js';
import { portfolioRoutes } from './modules/portfolio/portfolio.routes.js';
import { ExperienceService } from './modules/experience/experience.service.js';
import {
  accountRoutes,
  appearanceRoutes,
  publicThemeRoutes,
} from './modules/experience/experience.routes.js';
import { AiConfigService } from './modules/ai/ai-config.service.js';
import { AiContextBuilder } from './modules/ai/ai-context-builder.js';
import { AiPricingService } from './modules/ai/ai-pricing.service.js';
import { AiService } from './modules/ai/ai.service.js';
import { AiUsageService } from './modules/ai/ai-usage.service.js';
import { aiRoutes } from './modules/ai/ai.routes.js';
import { ProviderCircuitBreaker } from './modules/ai/circuit-breaker.js';
import { ContextBudgetService } from './modules/ai/context-budget.service.js';
import {
  createAiProvider,
  createEmbeddingProvider,
} from './modules/ai/provider-registry.js';
import { KnowledgeBackfillService } from './modules/knowledge/knowledge-backfill.service.js';
import { KnowledgeRepository } from './modules/knowledge/knowledge.repository.js';
import { SalesService } from './modules/sales/sales.service.js';
import { salesRoutes } from './modules/sales/sales.routes.js';
import { SaleContractsService } from './modules/sales/contracts.service.js';
import { saleContractsRoutes } from './modules/sales/contracts.routes.js';
import { CommissionsService } from './modules/sales/commissions.service.js';
import {
  commissionRulesRoutes,
  commissionsRoutes,
} from './modules/sales/commissions.routes.js';
import { CommercialIntelligenceService } from './modules/commercial-intelligence/commercial-intelligence.service.js';
import { commercialIntelligenceRoutes } from './modules/commercial-intelligence/commercial-intelligence.routes.js';
import { KnowledgeService } from './modules/knowledge/knowledge.service.js';
import { knowledgeRoutes } from './modules/knowledge/knowledge.routes.js';
import { LocalKnowledgeStorage } from './modules/knowledge/knowledge-storage.js';

export interface BuildAppOptions {
  readonly config?: AppConfig;
  readonly logger?: NonNullable<FastifyServerOptions['logger']>;
  readonly readinessProbes?: readonly ReadinessProbe[];
  readonly identityService?: IdentityService | null;
  readonly administradorasService?: AdministradorasService | null;
  readonly produtosService?: ProdutosService | null;
  readonly gruposService?: GruposService | null;
  readonly cotasService?: CotasService | null;
  readonly assembleiasService?: AssembleiasService | null;
  readonly lancesService?: LancesService | null;
  readonly contemplacoesService?: ContemplacoesService | null;
  readonly importacoesService?: ImportacoesService | null;
  readonly dataQualityService?: DataQualityService | null;
  readonly grupoHistoricoService?: GrupoHistoricoService | null;
  readonly comparadorService?: ComparadorService | null;
  readonly indiceAderenciaService?: IndiceAderenciaService | null;
  readonly simuladorPublicoService?: SimuladorPublicoService | null;
  readonly leadsService?: LeadsService | null;
  readonly integrationsService?: IntegrationsService | null;
  readonly dashboardService?: DashboardService | null;
  readonly tabelasComerciaisService?: TabelasComerciaisService | null;
  readonly simulationsService?: SimulationsService | null;
  readonly commercialConfigurationsService?: CommercialConfigurationsService | null;
  readonly proposalsService?: ProposalsService | null;
  readonly experienceService?: ExperienceService | null;
  readonly aiService?: AiService | null;
  readonly followUpsService?: FollowUpsService | null;
  readonly portfolioService?: PortfolioService | null;
  readonly agendaService?: AgendaService | null;
  readonly salesService?: SalesService | null;
  readonly saleContractsService?: SaleContractsService | null;
  readonly commissionsService?: CommissionsService | null;
  readonly commercialIntelligenceService?: CommercialIntelligenceService | null;
  readonly knowledgeService?: KnowledgeService | null;
}

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const config = options.config ?? parseEnvironment();
  const logger =
    options.logger === undefined ? createLoggerOptions(config) : options.logger;

  const app = Fastify({
    bodyLimit: config.REQUEST_BODY_LIMIT_BYTES,
    genReqId: () => randomUUID(),
    logger,
    requestTimeout: config.REQUEST_TIMEOUT_MS,
    trustProxy:
      config.TRUST_PROXY_HOPS === 0
        ? false
        : (_address, hop) => hop < config.TRUST_PROXY_HOPS,
  });

  registerRequestContext(app);
  registerErrorHandler(app);
  await registerSecurityPlugins(app, config);
  await app.register(multipart, {
    // Upload de importação envia até 3 partes: arquivo + tipoImportacao +
    // classificacaoArquivo (opcional). A rota valida cada campo.
    limits: { fileSize: IMPORT_MAX_BYTES, files: 1, fields: 2, parts: 3 },
  });
  registerAuthContext(app);

  await app.register(technicalRoutes, {
    prefix: apiPrefix,
    probes: options.readinessProbes ?? [],
  });

  const identityService =
    options.identityService === undefined
      ? config.DATABASE_URL
        ? new IdentityService(getPrismaClient(config), config)
        : null
      : options.identityService;
  const administradorasService =
    options.administradorasService === undefined
      ? config.DATABASE_URL
        ? new AdministradorasService(getPrismaClient(config))
        : null
      : options.administradorasService;
  const produtosService =
    options.produtosService === undefined
      ? config.DATABASE_URL
        ? new ProdutosService(getPrismaClient(config))
        : null
      : options.produtosService;
  const gruposService =
    options.gruposService === undefined
      ? config.DATABASE_URL
        ? new GruposService(getPrismaClient(config))
        : null
      : options.gruposService;
  const cotasService =
    options.cotasService === undefined
      ? config.DATABASE_URL
        ? new CotasService(getPrismaClient(config))
        : null
      : options.cotasService;
  const assembleiasService =
    options.assembleiasService === undefined
      ? config.DATABASE_URL
        ? new AssembleiasService(getPrismaClient(config))
        : null
      : options.assembleiasService;
  const lancesService =
    options.lancesService === undefined
      ? config.DATABASE_URL
        ? new LancesService(getPrismaClient(config))
        : null
      : options.lancesService;
  const contemplacoesService =
    options.contemplacoesService === undefined
      ? config.DATABASE_URL
        ? new ContemplacoesService(getPrismaClient(config))
        : null
      : options.contemplacoesService;
  const importacoesService =
    options.importacoesService === undefined
      ? config.DATABASE_URL
        ? new ImportacoesService(getPrismaClient(config))
        : null
      : options.importacoesService;
  const dataQualityService =
    options.dataQualityService === undefined
      ? config.DATABASE_URL
        ? new DataQualityService(getPrismaClient(config))
        : null
      : options.dataQualityService;
  const grupoHistoricoService =
    options.grupoHistoricoService === undefined
      ? config.DATABASE_URL
        ? new GrupoHistoricoService(getPrismaClient(config))
        : null
      : options.grupoHistoricoService;
  const comparadorService =
    options.comparadorService === undefined
      ? config.DATABASE_URL
        ? new ComparadorService(getPrismaClient(config))
        : null
      : options.comparadorService;
  const indiceAderenciaService =
    options.indiceAderenciaService === undefined
      ? comparadorService
        ? new IndiceAderenciaService(comparadorService)
        : null
      : options.indiceAderenciaService;
  const simuladorPublicoService =
    options.simuladorPublicoService === undefined
      ? comparadorService
        ? new SimuladorPublicoService(comparadorService, config)
        : null
      : options.simuladorPublicoService;
  const leadsService =
    options.leadsService === undefined
      ? config.DATABASE_URL
        ? new LeadsService(getPrismaClient(config))
        : null
      : options.leadsService;
  const integrationsService =
    options.integrationsService === undefined
      ? config.DATABASE_URL
        ? new IntegrationsService(
            new IntegrationsRepository(getPrismaClient(config)),
            config,
            importacoesService ?? undefined,
          )
        : null
      : options.integrationsService;
  const dashboardService =
    options.dashboardService === undefined
      ? config.DATABASE_URL
        ? new DashboardService(new DashboardRepository(getPrismaClient(config)))
        : null
      : options.dashboardService;
  const commercialIntelligenceService =
    options.commercialIntelligenceService === undefined
      ? config.DATABASE_URL
        ? new CommercialIntelligenceService(getPrismaClient(config))
        : null
      : options.commercialIntelligenceService;
  const analyticsService = config.DATABASE_URL
    ? new AnalyticsService(getPrismaClient(config))
    : null;
  const tabelasComerciaisService =
    options.tabelasComerciaisService === undefined
      ? config.DATABASE_URL
        ? new TabelasComerciaisService(getPrismaClient(config))
        : null
      : options.tabelasComerciaisService;
  const simulationsService =
    options.simulationsService === undefined
      ? config.DATABASE_URL
        ? new SimulationsService(getPrismaClient(config))
        : null
      : options.simulationsService;
  const commercialConfigurationsService =
    options.commercialConfigurationsService === undefined
      ? config.DATABASE_URL
        ? new CommercialConfigurationsService(getPrismaClient(config))
        : null
      : options.commercialConfigurationsService;
  const proposalsService =
    options.proposalsService === undefined
      ? config.DATABASE_URL &&
        simulationsService &&
        commercialConfigurationsService
        ? new ProposalsService(
            getPrismaClient(config),
            simulationsService,
            commercialConfigurationsService,
          )
        : null
      : options.proposalsService;
  const experienceService =
    options.experienceService === undefined
      ? config.DATABASE_URL
        ? new ExperienceService(getPrismaClient(config))
        : null
      : options.experienceService;
  const followUpsService =
    options.followUpsService === undefined
      ? config.DATABASE_URL
        ? new FollowUpsService(getPrismaClient(config))
        : null
      : options.followUpsService;
  const agendaService =
    options.agendaService === undefined
      ? config.DATABASE_URL
        ? new AgendaService(getPrismaClient(config))
        : null
      : options.agendaService;
  const portfolioService =
    options.portfolioService === undefined
      ? config.DATABASE_URL &&
        leadsService &&
        followUpsService
        ? new PortfolioService(
            getPrismaClient(config),
            leadsService,
            followUpsService,
          )
        : null
      : options.portfolioService;
  const knowledgeService =
    options.knowledgeService === undefined
      ? config.DATABASE_URL
        ? new KnowledgeService(
            getPrismaClient(config),
            new LocalKnowledgeStorage(
              config.KNOWLEDGE_STORAGE_DIR ??
                join(tmpdir(), 'larcarvalho-knowledge'),
            ),
            {
              maxBytes: config.KNOWLEDGE_MAX_BYTES,
              retrievalMode: config.AI_RETRIEVAL_MODE,
              rrfK: config.AI_RRF_K,
              topK: config.AI_TOP_K,
              // No pgvector in the provisioned images: production vector
              // storage is absent, so SEMANTIC/HYBRID stay unavailable.
              vectorStore: null,
            },
            createEmbeddingProvider(config.AI_EMBEDDING_PROVIDER, config),
          )
        : null
      : options.knowledgeService;
  const aiConfigService = new AiConfigService(config);
  const aiPricingService = config.DATABASE_URL
    ? new AiPricingService(getPrismaClient(config))
    : null;
  const aiUsageService =
    config.DATABASE_URL && aiPricingService
      ? new AiUsageService(getPrismaClient(config), aiPricingService)
      : null;
  const aiBudgetService = new ContextBudgetService();
  const aiCircuitBreaker = new ProviderCircuitBreaker();
  const aiProvider = createAiProvider(config.AI_PROVIDER, config);
  const aiFallbackProvider =
    config.AI_FALLBACK_PROVIDER !== 'none' &&
    config.AI_FALLBACK_PROVIDER !== config.AI_PROVIDER
      ? createAiProvider(config.AI_FALLBACK_PROVIDER, config)
      : null;
  // Backfill shares the production embedding path (refuses without store).
  const knowledgeBackfillService = config.DATABASE_URL
    ? new KnowledgeBackfillService(
        new KnowledgeRepository(getPrismaClient(config)),
        createEmbeddingProvider(config.AI_EMBEDDING_PROVIDER, config),
        null,
      )
    : null;
  const salesService =
    options.salesService === undefined
      ? config.DATABASE_URL
        ? new SalesService(getPrismaClient(config))
        : null
      : options.salesService;
  const saleContractsService =
    options.saleContractsService === undefined
      ? config.DATABASE_URL
        ? new SaleContractsService(getPrismaClient(config))
        : null
      : options.saleContractsService;
  const commissionsService =
    options.commissionsService === undefined
      ? config.DATABASE_URL
        ? new CommissionsService(getPrismaClient(config))
        : null
      : options.commissionsService;
  const aiContextBuilder = new AiContextBuilder({
    agendaService,
    commissionsService,
    commercialIntelligenceService,
    knowledgeService,
    leadsService,
    portfolioService,
    proposalsService,
    salesService,
    simulationsService,
  });
  const aiService =
    options.aiService === undefined
      ? new AiService(config, aiConfigService, aiProvider, aiContextBuilder, {
          allowedModels: aiConfigService.allowedModels(),
          budgetService: aiBudgetService,
          circuitBreaker: aiCircuitBreaker,
          fallbackProvider: aiFallbackProvider,
          pricingService: aiPricingService,
          reserveTokens: config.AI_CONTEXT_RESERVE_TOKENS,
          usageService: aiUsageService,
        })
      : options.aiService;
  if (experienceService) {
    await app.register(publicThemeRoutes, {
      service: experienceService,
      prefix: `${apiPrefix}/public/theme`,
    });
  }
  if (analyticsService) {
    await app.register(publicAnalyticsRoutes, {
      config,
      service: analyticsService,
      prefix: `${apiPrefix}/public/analytics`,
    });
  }

  if (simuladorPublicoService) {
    await app.register(simuladorPublicoRoutes, {
      config,
      service: simuladorPublicoService,
      prefix: `${apiPrefix}/public`,
    });
  }
  if (leadsService) {
    await app.register(publicLeadsRoutes, {
      config,
      service: leadsService,
      prefix: `${apiPrefix}/public/leads`,
    });
  }

  if (identityService) {
    await app.register(authRoutes, {
      config,
      identityService,
      prefix: `${apiPrefix}/auth`,
    });
    await app.register(teamsRoutes, { config, identityService, prefix: `${apiPrefix}/teams` });
    await app.register(usersRoutes, {
      config,
      identityService,
      prefix: `${apiPrefix}/users`,
    });
    if (administradorasService) {
      await app.register(administradorasRoutes, {
        administradorasService,
        config,
        identityService,
        prefix: `${apiPrefix}/administradoras`,
      });
    }
    if (produtosService && gruposService && cotasService) {
      await app.register(operacionalRoutes, {
        config,
        cotas: cotasService,
        grupos: gruposService,
        identityService,
        prefix: apiPrefix,
        produtos: produtosService,
      });
    }
    if (assembleiasService && lancesService && contemplacoesService) {
      await app.register(historicoRoutes, {
        config,
        identityService,
        prefix: apiPrefix,
        assembleias: assembleiasService,
        lances: lancesService,
        contemplacoes: contemplacoesService,
      });
    }
    if (importacoesService) {
      await app.register(importacoesRoutes, {
        config,
        identityService,
        importacoesService,
        prefix: `${apiPrefix}/importacoes`,
      });
    }
    if (tabelasComerciaisService) {
      await app.register(tabelasComerciaisRoutes, {
        config,
        identityService,
        service: tabelasComerciaisService,
        prefix: `${apiPrefix}/tabelas-comerciais`,
      });
    }
    if (dataQualityService) {
      await app.register(dataQualityRoutes, {
        config,
        identityService,
        service: dataQualityService,
        prefix: `${apiPrefix}/data-quality`,
      });
    }
    if (grupoHistoricoService) {
      await app.register(grupoHistoricoRoutes, {
        config,
        identityService,
        service: grupoHistoricoService,
        prefix: apiPrefix,
      });
    }
    if (comparadorService) {
      await app.register(comparadorRoutes, {
        config,
        identityService,
        service: comparadorService,
        prefix: `${apiPrefix}/comparador`,
      });
    }
    if (indiceAderenciaService) {
      await app.register(indiceAderenciaRoutes, {
        config,
        identityService,
        service: indiceAderenciaService,
        prefix: `${apiPrefix}/indice-aderencia`,
      });
    }
    if (leadsService) {
      await app.register(leadsRoutes, {
        config,
        identityService,
        service: leadsService,
        prefix: `${apiPrefix}/leads`,
      });
    }
    if (integrationsService) {
      await app.register(integrationsRoutes, {
        config,
        identityService,
        service: integrationsService,
        prefix: `${apiPrefix}/integrations`,
      });
    }
    if (dashboardService) {
      await app.register(dashboardRoutes, {
        config,
        identityService,
        service: dashboardService,
        prefix: `${apiPrefix}/dashboard`,
      });
    }
    if (commercialIntelligenceService) {
      await app.register(commercialIntelligenceRoutes, {
        config,
        identityService,
        service: commercialIntelligenceService,
        prefix: `${apiPrefix}/commercial-intelligence`,
      });
    }
    if (analyticsService) {
      await app.register(analyticsRoutes, {
        config,
        identityService,
        service: analyticsService,
        prefix: `${apiPrefix}/analytics`,
      });
    }
    if (simulationsService) {
      await app.register(simulationsRoutes, {
        config,
        identityService,
        service: simulationsService,
        prefix: `${apiPrefix}/simulations`,
      });
    }
    if (commercialConfigurationsService) {
      await app.register(commercialConfigurationRoutes, {
        config,
        identityService,
        service: commercialConfigurationsService,
        prefix: `${apiPrefix}/commercial-configurations`,
      });
      await app.register(productCommercialRulesRoutes, {
        config,
        identityService,
        service: commercialConfigurationsService,
        prefix: `${apiPrefix}/product-commercial-rules`,
      });
    }
    if (experienceService) {
      await app.register(appearanceRoutes, {
        config,
        identityService,
        service: experienceService,
        prefix: `${apiPrefix}/appearance`,
      });
      await app.register(accountRoutes, {
        config,
        identityService,
        service: experienceService,
        prefix: `${apiPrefix}/account`,
      });
    }
    if (proposalsService) {
      await app.register(proposalsRoutes, {
        config,
        identityService,
        service: proposalsService,
        prefix: `${apiPrefix}/proposals`,
      });
      await app.register(simulationProposalsRoutes, {
        config,
        identityService,
        service: proposalsService,
        prefix: `${apiPrefix}/simulations`,
      });
    }
    if (aiService) {
      await app.register(aiRoutes, {
        aiService,
        config,
        configService: aiConfigService,
        db: config.DATABASE_URL ? getPrismaClient(config) : null,
        identityService,
        prefix: `${apiPrefix}/ai`,
        pricingService: aiPricingService,
        usageService: aiUsageService,
      });
    }
    if (followUpsService) {
      await app.register(followUpsRoutes, {
        config,
        identityService,
        service: followUpsService,
        prefix: `${apiPrefix}/follow-ups`,
      });
    }
    if (agendaService) {
      await app.register(agendaRoutes, {
        config,
        identityService,
        service: agendaService,
        prefix: `${apiPrefix}/agenda`,
      });
    }
    if (portfolioService) {
      await app.register(portfolioRoutes, {
        config,
        identityService,
        service: portfolioService,
        prefix: `${apiPrefix}/portfolio`,
      });
    }
    if (salesService) {
      await app.register(salesRoutes, {
        config,
        identityService,
        service: salesService,
        prefix: `${apiPrefix}/sales`,
      });
    }
    if (saleContractsService) {
      await app.register(saleContractsRoutes, {
        config,
        identityService,
        service: saleContractsService,
        prefix: `${apiPrefix}`,
      });
    }
    if (commissionsService) {
      await app.register(commissionsRoutes, {
        config,
        identityService,
        service: commissionsService,
        prefix: `${apiPrefix}/commissions`,
      });
      await app.register(commissionRulesRoutes, {
        config,
        identityService,
        service: commissionsService,
        prefix: `${apiPrefix}/commission-rules`,
      });
    }
    if (knowledgeService) {
      await app.register(knowledgeRoutes, {
        backfillService: knowledgeBackfillService ?? undefined,
        config,
        identityService,
        service: knowledgeService,
        prefix: `${apiPrefix}/knowledge`,
      });
    }
  }

  // Register observability
  if (config.METRICS_ENABLED) {
    await registerHttpMetrics(app, {
      slowRequestThresholdMs: config.SLOW_REQUEST_THRESHOLD_MS,
    });

    await app.register(metricsRoutes, {
      config,
      prefix: apiPrefix,
    });
  }

  return app;
}
