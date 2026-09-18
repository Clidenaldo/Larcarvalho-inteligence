import {
  classificacaoArquivoSchema,
  classifyImportacaoRequestSchema,
  importExecutionPlanSchema,
  importacaoIssueListResponseSchema,
  importacaoIssueQuerySchema,
  importacaoListQuerySchema,
  importacaoListResponseSchema,
  importacaoPreviewSchema,
  importacaoSchema,
  importacaoTipoSchema,
  importacaoValidationSchema,
  mappingRequestSchema,
  validateImportacaoRequestSchema,
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
import { IMPORT_MAX_BYTES } from './import-file.js';
import type { ImportacoesService } from './importacoes.service.js';

interface Options {
  config: AppConfig;
  identityService: IdentityService;
  importacoesService: ImportacoesService;
}
const params = z.object({ id: z.uuid() });
const previewQuery = z.object({
  aba: z.string().trim().min(1).max(200).optional(),
});
const metadata = (request: FastifyRequest): RequestMetadata => ({
  ipAddress: request.ip,
  ...(request.headers['user-agent']
    ? { userAgent: request.headers['user-agent'] }
    : {}),
});

export const importacoesRoutes: FastifyPluginAsync<Options> = async (
  app,
  options,
) => {
  app.addHook('onRequest', async (request) => {
    if (typeof request.raw.setTimeout === 'function')
      request.raw.setTimeout(120_000);
  });
  const auth = createAuthenticateRequest(
    options.identityService,
    options.config,
  );
  const origin = createRequireTrustedOrigin(options.config);
  const secure = (permission: 'importacoes.create' | 'importacoes.execute') => [
    origin,
    auth,
    requirePermission(permission),
  ];
  const service = options.importacoesService;

  app.get(
    '/',
    { preHandler: [auth, requirePermission('importacoes.read')] },
    async (request) =>
      importacaoListResponseSchema.parse(
        await service.list(
          authenticatedContext(request),
          importacaoListQuerySchema.parse(request.query),
        ),
      ),
  );
  app.post(
    '/upload',
    {
      bodyLimit: IMPORT_MAX_BYTES + 65_536,
      preHandler: secure('importacoes.create'),
    },
    async (request, reply) => {
      let tipo: string | undefined;
      let classificacao: string | undefined;
      let file: { filename: string; mime: string; bytes: Buffer } | undefined;
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          if (part.fieldname !== 'arquivo' || file)
            throw new Error('Campo de arquivo inesperado');
          file = {
            filename: part.filename,
            mime: part.mimetype,
            bytes: await part.toBuffer(),
          };
        } else if (part.fieldname === 'tipoImportacao' && !tipo)
          tipo = String(part.value);
        else if (
          part.fieldname === 'classificacaoArquivo' &&
          !classificacao &&
          String(part.value).trim()
        )
          classificacao = String(part.value);
        else if (
          part.fieldname === 'classificacaoArquivo' &&
          !String(part.value).trim()
        ) {
          // vazio = não classificado (fluxo legado); ignora o campo
        } else throw new Error('Campo multipart inesperado');
      }
      if (!file || !tipo)
        throw new Error('tipoImportacao e arquivo são obrigatórios');
      return reply
        .code(201)
        .send(
          importacaoSchema.parse(
            await service.upload(
              authenticatedContext(request),
              {
                tipo: importacaoTipoSchema.parse(tipo),
                ...(classificacao
                  ? {
                      classificacaoArquivo: classificacaoArquivoSchema.parse(
                        classificacao,
                      ),
                    }
                  : {}),
                ...file,
              },
              metadata(request),
            ),
          ),
        );
    },
  );
  app.get(
    '/:id',
    { preHandler: [auth, requirePermission('importacoes.read')] },
    async (request) =>
      importacaoSchema.parse(
        await service.get(
          authenticatedContext(request),
          params.parse(request.params).id,
        ),
      ),
  );
  app.get(
    '/:id/preview',
    { preHandler: [auth, requirePermission('importacoes.read')] },
    async (request) =>
      importacaoPreviewSchema.parse(
        await service.preview(
          authenticatedContext(request),
          params.parse(request.params).id,
          previewQuery.parse(request.query).aba,
        ),
      ),
  );
  app.post(
    '/:id/classify',
    { preHandler: secure('importacoes.create') },
    async (request) =>
      importacaoSchema.parse(
        await service.classify(
          authenticatedContext(request),
          params.parse(request.params).id,
          classifyImportacaoRequestSchema.parse(request.body),
          metadata(request),
        ),
      ),
  );
  app.post(
    '/:id/mapping',
    { preHandler: secure('importacoes.create') },
    async (request) =>
      importacaoSchema.parse(
        await service.saveMapping(
          authenticatedContext(request),
          params.parse(request.params).id,
          mappingRequestSchema.parse(request.body),
          metadata(request),
        ),
      ),
  );
  app.post(
    '/:id/validate',
    { preHandler: secure('importacoes.create') },
    async (request) =>
      importacaoValidationSchema.parse(
        await service.validate(
          authenticatedContext(request),
          params.parse(request.params).id,
          validateImportacaoRequestSchema.parse(request.body).estrategia,
          metadata(request),
        ),
      ),
  );
  app.post(
    '/:id/execute',
    { preHandler: secure('importacoes.execute') },
    async (request) =>
      importacaoSchema.parse(
        await service.execute(
          authenticatedContext(request),
          params.parse(request.params).id,
          metadata(request),
        ),
      ),
  );
  app.get(
    '/:id/plan',
    { preHandler: secure('importacoes.create') },
    async (request) =>
      importExecutionPlanSchema.parse(
        await service.plan(
          authenticatedContext(request),
          params.parse(request.params).id,
          metadata(request),
        ),
      ),
  );
  app.get(
    '/:id/issues',
    { preHandler: [auth, requirePermission('importacoes.read')] },
    async (request) =>
      importacaoIssueListResponseSchema.parse(
        await service.issues(
          authenticatedContext(request),
          params.parse(request.params).id,
          importacaoIssueQuerySchema.parse(request.query),
        ),
      ),
  );
};
