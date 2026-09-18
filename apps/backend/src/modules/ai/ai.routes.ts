import {
  aiPricingSchema,
  aiProviderTestSchema,
  aiUsageListQuerySchema,
  aiUsageSummarySchema,
  updateAiConfigRequestSchema,
  upsertAiPricingRequestSchema,
  type AiStreamEvent,
} from '@larcarvalho/shared';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import type { AppConfig } from '../../config/env.js';
import {
  authenticatedContext,
  createAuthenticateRequest,
  createRequireTrustedOrigin,
  requirePermission,
} from '../../core/auth/http-auth.js';
import { AppError } from '../../core/errors/app-error.js';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import type { IdentityService } from '../identity/identity.service.js';
import type { AiConfigService } from './ai-config.service.js';
import type { AiPricingService } from './ai-pricing.service.js';
import type { AiService } from './ai.service.js';
import type { AiUsageService, UsageLimits } from './ai-usage.service.js';

interface AiRoutesOptions {
  readonly aiService: AiService;
  readonly config: AppConfig;
  readonly configService: AiConfigService;
  readonly db: PrismaClient | null;
  readonly identityService: IdentityService;
  readonly pricingService: AiPricingService | null;
  readonly usageService: AiUsageService | null;
}

function readLimits(options: AiRoutesOptions): UsageLimits {
  const publicConfig = options.configService.getPublicConfig();
  return {
    dailyCostLimitMicros: publicConfig.dailyCostLimitMicros ?? null,
    dailyTokenLimit: publicConfig.dailyTokenLimit ?? null,
    maxTokensPerRequest: publicConfig.maxTokensPerRequest ?? null,
    monthlyCostLimitMicros: publicConfig.monthlyCostLimitMicros ?? null,
  };
}

function requireUsageService(
  options: AiRoutesOptions,
): AiUsageService {
  if (!options.usageService) {
    throw new AppError({
      code: 'AI_NOT_CONFIGURED',
      message: 'Telemetria de IA indisponível sem banco de dados.',
      statusCode: 503,
    });
  }
  return options.usageService;
}

function requirePricingService(
  options: AiRoutesOptions,
): AiPricingService {
  if (!options.pricingService || !options.db) {
    throw new AppError({
      code: 'AI_NOT_CONFIGURED',
      message: 'Precificação de IA indisponível sem banco de dados.',
      statusCode: 503,
    });
  }
  return options.pricingService;
}

async function auditChange(
  options: AiRoutesOptions,
  actorId: string,
  action: string,
  entity: string,
  entityId: string | null,
  metadata: Prisma.InputJsonValue,
): Promise<void> {
  if (!options.db) return;
  await options.db.auditLog.create({
    data: {
      action,
      actorId,
      entity,
      entityId,
      metadata,
    },
  });
}

function writeSseEvent(reply: FastifyReply, event: AiStreamEvent): void {
  reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
}

export const aiRoutes: FastifyPluginAsync<AiRoutesOptions> = async (
  app,
  options,
) => {
  const authenticate = createAuthenticateRequest(
    options.identityService,
    options.config,
  );
  const trustedOrigin = createRequireTrustedOrigin(options.config);

  app.get(
    '/status',
    { preHandler: [authenticate, requirePermission('ai.use')] },
    async () => options.configService.getStatus(),
  );

  app.post(
    '/chat',
    {
      config: {
        rateLimit: { max: 30, timeWindow: 60_000 },
      },
      preHandler: [trustedOrigin, authenticate, requirePermission('ai.use')],
    },
    async (request) => {
      const { response, audit } = await options.aiService.chat(
        authenticatedContext(request),
        request.body,
      );
      request.log.info(
        {
          aiContextType: audit.contextType,
          aiModel: audit.model,
          aiPromptId: audit.promptId,
          aiPromptVersion: audit.promptVersion,
          aiProvider: audit.provider,
        },
        'AI_REQUEST',
      );
      return response;
    },
  );

  app.post(
    '/chat/stream',
    {
      config: {
        rateLimit: { max: 30, timeWindow: 60_000 },
      },
      preHandler: [trustedOrigin, authenticate, requirePermission('ai.use')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const actor = authenticatedContext(request);
      const controller = new AbortController();
      let settled = false;
      const onClose = () => {
        if (!settled) controller.abort();
      };
      request.raw.on('close', onClose);
      reply.hijack();
      reply.raw.writeHead(200, {
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        'content-type': 'text/event-stream',
      });
      try {
        const generator = options.aiService.chatStream(
          actor,
          request.body,
          controller.signal,
        );
        for await (const event of generator) {
          if (controller.signal.aborted) break;
          writeSseEvent(reply, event);
          if (event.type === 'done' || event.type === 'error') break;
        }
      } catch (error) {
        const code = error instanceof AppError ? error.code : 'PROVIDER_UNAVAILABLE';
        const message =
          error instanceof AppError ? error.message : 'Provedor de IA indisponível.';
        if (!controller.signal.aborted) {
          writeSseEvent(reply, { code, message, type: 'error' });
        }
      } finally {
        settled = true;
        request.raw.off('close', onClose);
        reply.raw.end();
      }
    },
  );

  app.get(
    '/config',
    { preHandler: [authenticate, requirePermission('ai.settings')] },
    async () => options.configService.getPublicConfig(),
  );

  app.patch(
    '/config',
    {
      preHandler: [trustedOrigin, authenticate, requirePermission('ai.settings')],
    },
    async (request) => {
      const input = updateAiConfigRequestSchema.parse(request.body);
      const updated = options.configService.updateConfig(input);
      await auditChange(
        options,
        authenticatedContext(request).user.id,
        'AI_CONFIG_UPDATED',
        'AiConfig',
        null,
        { keys: Object.keys(input) },
      ).catch(() => undefined);
      return updated;
    },
  );

  app.get(
    '/usage',
    { preHandler: [authenticate, requirePermission('ai.usage')] },
    async (request) => {
      const service = requireUsageService(options);
      const query = aiUsageListQuerySchema.parse(request.query);
      const { items, total } = await service.list(query);
      return {
        items,
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      };
    },
  );

  app.get(
    '/usage/summary',
    { preHandler: [authenticate, requirePermission('ai.usage')] },
    async () =>
      aiUsageSummarySchema.parse(
        await requireUsageService(options).summarize(readLimits(options)),
      ),
  );

  app.get(
    '/pricing',
    { preHandler: [authenticate, requirePermission('ai.settings')] },
    async () => ({
      items: (await requirePricingService(options).listActive()).map((item) =>
        aiPricingSchema.parse(item),
      ),
    }),
  );

  app.put(
    '/pricing',
    {
      preHandler: [trustedOrigin, authenticate, requirePermission('ai.settings')],
    },
    async (request) => {
      const service = requirePricingService(options);
      const input = upsertAiPricingRequestSchema.parse(request.body);
      const { id } = await service.upsert({
        ...input,
        validFrom: input.validFrom ?? new Date().toISOString(),
      });
      await auditChange(
        options,
        authenticatedContext(request).user.id,
        'AI_PRICING_UPSERTED',
        'AiPricing',
        id,
        { currency: input.currency, model: input.model, provider: input.provider },
      ).catch(() => undefined);
      return { id };
    },
  );

  app.post(
    '/test-connection',
    {
      config: {
        rateLimit: { max: 5, timeWindow: 60_000 },
      },
      preHandler: [trustedOrigin, authenticate, requirePermission('ai.settings')],
    },
    async () =>
      aiProviderTestSchema.parse(
        await options.aiService.testProviderConnection(),
      ),
  );
};
