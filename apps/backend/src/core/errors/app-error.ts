import type { ApiErrorCode } from '@larcarvalho/shared';

export interface AppErrorOptions {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly statusCode: number;
}

export class AppError extends Error {
  override readonly name = 'AppError';
  readonly code: ApiErrorCode;
  readonly statusCode: number;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.code = options.code;
    this.statusCode = options.statusCode;
  }
}
