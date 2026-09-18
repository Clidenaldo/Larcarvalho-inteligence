import type { Permission } from '@larcarvalho/shared';
import {
  knowledgeDocumentListResponseSchema,
  knowledgeDocumentSchema,
  knowledgeIngestionSchema,
  knowledgeSearchResponseSchema,
} from '@larcarvalho/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import type { AppConfig } from '../../config/env.js';
import {
  authenticatedContext,
  createAuthenticateRequest,
  createRequireTrustedOrigin,
  requirePermission,
} from '../../core/auth/http-auth.js';
import { AppError } from '../../core/errors/app-error.js';
import type { IdentityService } from '../identity/identity.service.js';
import type { KnowledgeBackfillService } from './knowledge-backfill.service.js';
import { KNOWLEDGE_MAX_BYTES } from './knowledge-parser.js';
import type { KnowledgeService } from './knowledge.service.js';

interface Options {
  backfillService?: KnowledgeBackfillService | undefined;
  config: AppConfig;
  identityService: IdentityService;
  service: KnowledgeService;
}

const params = z.object({ id: z.uuid() });

export const knowledgeRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  const auth = createAuthenticateRequest(
    options.identityService,
    options.config,
  );
  const origin = createRequireTrustedOrigin(options.config);
  const service = options.service;
  const secure = (permission: Permission) => [
    origin,
    auth,
    requirePermission(permission),
  ];
  const read = [auth, requirePermission('knowledge.read')];

  app.get('/', { preHandler: read }, async (request) =>
    knowledgeDocumentListResponseSchema.parse(
      await service.list(authenticatedContext(request), request.query),
    ),
  );

  app.get(
    '/search',
    { preHandler: [auth, requirePermission('knowledge.search')] },
    async (request) =>
      knowledgeSearchResponseSchema.parse(
        await service.search(authenticatedContext(request), request.query),
      ),
  );

  app.post(
    '/text',
    { preHandler: secure('knowledge.create') },
    async (request, reply) =>
      reply.code(201).send(
        knowledgeDocumentSchema.parse(
          await service.createText(authenticatedContext(request), request.body),
        ),
      ),
  );

  app.post(
    '/upload',
    {
      bodyLimit: KNOWLEDGE_MAX_BYTES + 65_536,
      preHandler: secure('knowledge.create'),
    },
    async (request, reply) => {
      let file: { bytes: Buffer; filename: string; mime: string } | undefined;
      let metadataRaw: string | undefined;
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          if (part.fieldname !== 'arquivo' || file)
            throw new AppError({
              code: 'VALIDATION_ERROR',
              message: 'Campo de arquivo inesperado.',
              statusCode: 400,
            });
          file = {
            bytes: await part.toBuffer(),
            filename: part.filename,
            mime: part.mimetype,
          };
        } else if (part.fieldname === 'metadata' && metadataRaw === undefined) {
          metadataRaw = String(part.value);
        } else {
          throw new AppError({
            code: 'VALIDATION_ERROR',
            message: 'Campo multipart inesperado.',
            statusCode: 400,
          });
        }
      }
      if (!file || metadataRaw === undefined)
        throw new AppError({
          code: 'VALIDATION_ERROR',
          message: 'Informe o arquivo e os metadados do documento.',
          statusCode: 400,
        });
      let metadata: unknown;
      try {
        metadata = JSON.parse(metadataRaw);
      } catch {
        throw new AppError({
          code: 'VALIDATION_ERROR',
          message: 'Metadados inválidos.',
          statusCode: 400,
        });
      }
      return reply.code(201).send(
        knowledgeDocumentSchema.parse(
          await service.upload(authenticatedContext(request), {
            ...file,
            metadata,
          }),
        ),
      );
    },
  );

  app.get('/:id', { preHandler: read }, async (request) =>
    service.get(
      authenticatedContext(request),
      params.parse(request.params).id,
    ),
  );

  app.patch(
    '/:id',
    { preHandler: secure('knowledge.update') },
    async (request) =>
      knowledgeDocumentSchema.parse(
        await service.update(
          authenticatedContext(request),
          params.parse(request.params).id,
          request.body,
        ),
      ),
  );

  app.post(
    '/:id/archive',
    { preHandler: secure('knowledge.archive') },
    async (request) =>
      knowledgeDocumentSchema.parse(
        await service.archive(
          authenticatedContext(request),
          params.parse(request.params).id,
        ),
      ),
  );

  app.get('/:id/ingestions', { preHandler: read }, async (request) => ({
    items: (
      await service.listIngestions(
        authenticatedContext(request),
        params.parse(request.params).id,
      )
    ).map((item) => knowledgeIngestionSchema.parse(item)),
  }));

  app.post(
    '/embeddings/backfill',
    {
      config: { rateLimit: { max: 5, timeWindow: 60_000 } },
      preHandler: secure('knowledge.process'),
    },
    async (request) => {
      if (!options.backfillService) {
        throw new AppError({
          code: 'EMBEDDING_UNAVAILABLE',
          message: 'Embeddings indisponíveis: provedor não configurado.',
          statusCode: 503,
        });
      }
      const body = (request.body ?? {}) as { maxChunks?: unknown };
      const maxChunks =
        typeof body.maxChunks === 'number' &&
        Number.isInteger(body.maxChunks) &&
        body.maxChunks > 0
          ? Math.min(body.maxChunks, 500)
          : 200;
      return options.backfillService.run(maxChunks);
    },
  );
};
