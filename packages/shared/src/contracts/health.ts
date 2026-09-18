import { z } from 'zod';

import { apiVersion } from './api.js';

const technicalResponseSchema = z.object({
  requestId: z.string().min(1),
  service: z.literal('backend'),
  timestamp: z.iso.datetime(),
  version: z.literal(apiVersion),
});

export const healthResponseSchema = technicalResponseSchema.extend({
  status: z.literal('ok'),
});

export const readinessCheckSchema = z.object({
  name: z.string().min(1),
  status: z.enum(['ready', 'not_ready']),
});

export const readinessResponseSchema = technicalResponseSchema.extend({
  checks: z.array(readinessCheckSchema),
  status: z.enum(['ready', 'not_ready']),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ReadinessCheck = z.infer<typeof readinessCheckSchema>;
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
