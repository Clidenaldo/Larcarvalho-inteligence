import {
  connectionTestResponseSchema,
  createIntegrationRequestSchema,
  updateIntegrationRequestSchema,
  executeIntegrationRequestSchema,
  fixtureIntegrationConfigSchema,
  fixtureIntegrationScenarioSchema,
  integrationConfigurationSchema,
  integrationHealthSchema,
  integrationListQuerySchema,
  integrationListResponseSchema,
  integrationLogListResponseSchema,
  integrationRunListQuerySchema,
  integrationRunListResponseSchema,
  integrationRunSchema,
  integrationSchema,
  integrationSecretWriteSchema,
  manualImportIntegrationConfigSchema,
  mockIntegrationConfigSchema,
  restIntegrationConfigSchema,
  syncPreviewSchema,
  type CreateIntegrationRequest,
  type ExecuteIntegrationRequest,
  type FixtureIntegrationScenario,
  type IntegrationConfiguration,
  type IntegrationConnectorType,
  type IntegrationListQuery,
  type IntegrationRunListQuery,
  type Permission,
  type SyncPreview,
  type UpdateIntegrationRequest,
  type ApiErrorCode,
} from '@larcarvalho/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { AppConfig } from '../../config/env.js';
import {
  authenticatedContext,
  createAuthenticateRequest,
  createRequireTrustedOrigin,
  requirePermission,
} from '../../core/auth/http-auth.js';
import type {
  IdentityService,
  RequestMetadata,
} from '../identity/identity.service.js';
import type { IntegrationsService } from './integrations.service.js';

interface Options {
  readonly config: AppConfig;
  readonly identityService: IdentityService;
  readonly service: IntegrationsService;
}

const idParams = z.object({ id: z.uuid() });
const runParams = z.object({ runId: z.uuid() });
const metadata = (request: FastifyRequest): RequestMetadata => ({
  ipAddress: request.ip,
  ...(request.headers['user-agent']
    ? { userAgent: request.headers['user-agent'] }
    : {}),
});

const previewBodySchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
});

export const integrationsRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  const auth = createAuthenticateRequest(
    options.identityService,
    options.config,
  );
  const origin = createRequireTrustedOrigin(options.config);
  const mutate = (
    permission:
      | 'integrations.create'
      | 'integrations.update'
      | 'integrations.execute'
      | 'integrations.test_connection'
      | 'integrations.pause'
      | 'integrations.credentials',
  ) => [origin, auth, requirePermission(permission)];

  app.get(
    '/',
    { preHandler: [auth, requirePermission('integrations.read')] },
    async (request) =>
      integrationListResponseSchema.parse(
        await options.service.list(
          authenticatedContext(request),
          integrationListQuerySchema.parse(request.query),
        ),
      ),
  );

  app.post(
    '/',
    { preHandler: mutate('integrations.create') },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          integrationSchema.parse(
            await options.service.create(
              authenticatedContext(request),
              createIntegrationRequestSchema.parse(request.body),
              metadata(request),
            ),
          ),
        ),
  );

  app.get(
    '/runs/:runId',
    { preHandler: [auth, requirePermission('integrations.logs')] },
    async (request) =>
      integrationRunSchema.parse(
        await options.service.getRun(
          authenticatedContext(request),
          runParams.parse(request.params).runId,
        ),
      ),
  );

  app.get(
    '/:id',
    { preHandler: [auth, requirePermission('integrations.read')] },
    async (request) =>
      integrationSchema.parse(
        await options.service.get(
          authenticatedContext(request),
          idParams.parse(request.params).id,
        ),
      ),
  );

  app.patch(
    '/:id',
    { preHandler: mutate('integrations.update') },
    async (request) =>
      integrationSchema.parse(
        await options.service.update(
          authenticatedContext(request),
          idParams.parse(request.params).id,
          updateIntegrationRequestSchema.parse(request.body),
          metadata(request),
        ),
      ),
  );

  app.post(
    '/:id/test-connection',
    { preHandler: mutate('integrations.test_connection') },
    async (request) =>
      connectionTestResponseSchema.parse(
        await options.service.testConnection(
          authenticatedContext(request),
          idParams.parse(request.params).id,
          request.id,
          metadata(request),
        ),
      ),
  );

  app.post(
    '/:id/execute',
    { preHandler: mutate('integrations.execute') },
    async (request) =>
      integrationRunSchema.parse(
        await options.service.execute(
          authenticatedContext(request),
          idParams.parse(request.params).id,
          executeIntegrationRequestSchema.parse(request.body ?? {}),
          request.id,
          metadata(request),
        ),
      ),
  );

  for (const [path, paused] of [
    ['pause', true],
    ['resume', false],
  ] as const) {
    app.post(
      `/:id/${path}`,
      { preHandler: mutate('integrations.pause') },
      async (request) =>
        integrationSchema.parse(
          await options.service.setPaused(
            authenticatedContext(request),
            idParams.parse(request.params).id,
            paused,
            metadata(request),
          ),
        ),
    );
  }

  app.get(
    '/:id/runs',
    { preHandler: [auth, requirePermission('integrations.logs')] },
    async (request) =>
      integrationRunListResponseSchema.parse(
        await options.service.listRuns(
          authenticatedContext(request),
          idParams.parse(request.params).id,
          integrationRunListQuerySchema.parse(request.query),
        ),
      ),
  );

  app.get(
    '/:id/logs',
    { preHandler: [auth, requirePermission('integrations.logs')] },
    async (request) =>
      integrationLogListResponseSchema.parse(
        await options.service.listLogs(
          authenticatedContext(request),
          idParams.parse(request.params).id,
          integrationRunListQuerySchema.parse(request.query),
        ),
      ),
  );
};
