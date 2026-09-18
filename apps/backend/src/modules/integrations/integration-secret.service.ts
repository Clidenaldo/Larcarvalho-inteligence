import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

import { AppError } from '../../core/errors/app-error.js';
import type { AppConfig } from '../../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;

function requireKey(config: AppConfig): Buffer {
  const key = config.INTEGRATION_SECRETS_KEY;
  if (!key)
    throw new AppError({
      code: 'INTERNAL_ERROR',
      message: 'Chave de secrets de integracao nao configurada',
      statusCode: 500,
    });
  return Buffer.from(key.padEnd(KEY_BYTES, '0').slice(0, KEY_BYTES), 'utf-8');
}

export class IntegrationSecretService {
  constructor(private readonly config: AppConfig) {}

  encrypt(plaintext: string): {
    ciphertext: string;
    iv: string;
    authTag: string;
    keyVersion: string;
  } {
    const key = requireKey(this.config);
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf-8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      keyVersion: this.config.INTEGRATION_SECRETS_KEY_VERSION,
    };
  }

  decrypt(
    ciphertext: string,
    iv: string,
    authTag: string,
    keyVersion: string,
  ): string {
    if (keyVersion !== this.config.INTEGRATION_SECRETS_KEY_VERSION)
      throw new AppError({
        code: 'INTERNAL_ERROR',
        message: 'Versao da chave de secret nao compativel',
        statusCode: 500,
      });
    const key = requireKey(this.config);
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));
    const decoded = Buffer.from(ciphertext, 'base64');
    return Buffer.concat([decipher.update(decoded), decipher.final()]).toString(
      'utf-8',
    );
  }

  mask(): string {
    return '****';
  }
}
