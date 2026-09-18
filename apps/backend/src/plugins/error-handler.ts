import type { ApiErrorCode, ApiErrorResponse } from '@larcarvalho/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { AppError } from '../core/errors/app-error.js';

interface NormalizedError {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly statusCode: number;
}

function normalizeError(error: unknown): NormalizedError {
  if (error instanceof AppError) {
    return error;
  }

  const isFastifyValidationError =
    typeof error === 'object' &&
    error !== null &&
    'validation' in error &&
    Boolean(error.validation);

  if (error instanceof ZodError || isFastifyValidationError) {
    return {
      code: 'VALIDATION_ERROR',
      message: 'Dados inválidos',
      statusCode: 400,
    };
  }

  const statusCode =
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
      ? error.statusCode
      : undefined;

  if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
    return {
      code: 'VALIDATION_ERROR',
      message: 'Requisição inválida',
      statusCode,
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: 'Ocorreu um erro inesperado',
    statusCode: 500,
  };
}

function createErrorResponse(
  error: NormalizedError,
  request: FastifyRequest,
): ApiErrorResponse {
  return {
    error: {
      code: error.code,
      message: error.message,
      requestId: request.id,
    },
  };
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler(async (request, reply) => {
    const error: NormalizedError = {
      code: 'NOT_FOUND',
      message: 'Rota não encontrada',
      statusCode: 404,
    };

    await reply
      .code(error.statusCode)
      .send(createErrorResponse(error, request));
  });

  app.setErrorHandler(async (error, request, reply) => {
    const normalizedError = normalizeError(error);

    if (normalizedError.statusCode >= 500) {
      request.log.error(
        { err: error, requestId: request.id },
        'Unhandled request error',
      );
    }

    await reply
      .code(normalizedError.statusCode)
      .send(createErrorResponse(normalizedError, request));
  });
}
