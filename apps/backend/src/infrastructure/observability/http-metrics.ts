import type { FastifyInstance } from 'fastify';
import { getMetricsRegistry } from './metrics-registry.js';

/**
 * HTTP Request Metrics
 * Tracks:
 * - Request count by method and route
 * - Request duration
 * - Response status codes
 * - Error rates (5xx)
 * - Slow requests
 */

interface RequestMetadata {
  startTime: number;
  method: string;
  route: string;
}

const REQUEST_METADATA_STORE = new WeakMap<object, RequestMetadata>();

function normalizeRoute(url: string): string {
  // Remove query string
  const pathname = new URL(url, 'http://localhost').pathname;
  if (!pathname) return '/unknown';

  // Replace UUIDs and numbers in path with placeholder
  return pathname
    .replace(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      '/:id',
    )
    .replace(/\/\d+/g, '/:id');
}

function getStatusCodeBucket(statusCode: number): string {
  if (statusCode < 300) return '2xx';
  if (statusCode < 400) return '3xx';
  if (statusCode < 500) return '4xx';
  return '5xx';
}

export async function registerHttpMetrics(
  app: FastifyInstance,
  options: {
    slowRequestThresholdMs?: number;
  } = {},
): Promise<void> {
  const slowThreshold = options.slowRequestThresholdMs ?? 1000;
  const registry = getMetricsRegistry();

  // Initialize metrics
  registry.incrementCounter('http_requests_total', 'Total HTTP requests', 0);

  // onRequest hook - start timing
  app.addHook('onRequest', async (request, _reply) => {
    const metadata: RequestMetadata = {
      startTime: Date.now(),
      method: request.method,
      route: normalizeRoute(request.url),
    };

    REQUEST_METADATA_STORE.set(request, metadata);
    const inFlight = registry.getGauge('http_requests_in_flight');
    registry.setGauge('http_requests_in_flight', inFlight + 1);
  });

  // onResponse hook - record metrics
  app.addHook('onResponse', async (request, reply) => {
    const metadata = REQUEST_METADATA_STORE.get(request);
    if (!metadata) return;

    // Decrement in-flight
    const inFlight = registry.getGauge('http_requests_in_flight');
    registry.setGauge('http_requests_in_flight', Math.max(0, inFlight - 1));

    const duration = Date.now() - metadata.startTime;
    const statusCode = reply.statusCode;
    const statusBucket = getStatusCodeBucket(statusCode);

    // Total requests
    registry.incrementCounter('http_requests_total', 'Total HTTP requests');

    // By method
    registry.incrementCounter(
      `http_requests_by_method_total{method="${metadata.method}"}`,
      `HTTP requests by method`,
    );

    // By route
    registry.incrementCounter(
      `http_requests_by_route_total{route="${metadata.route}"}`,
      `HTTP requests by route`,
    );

    // By status bucket
    registry.incrementCounter(
      `http_requests_by_status_total{status_bucket="${statusBucket}",status="${statusCode}"}`,
      `HTTP requests by status`,
    );

    // Duration histogram
    registry.observeHistogram(
      'http_request_duration_seconds',
      duration / 1000,
      'HTTP request duration in seconds',
    );

    // Error rate (5xx only)
    if (statusCode >= 500) {
      registry.incrementCounter(
        `http_requests_errors_total{status="${statusCode}"}`,
        'HTTP 5xx errors',
      );
    }

    // Slow requests
    if (duration > slowThreshold) {
      request.log.warn({
        type: 'slow_request',
        duration,
        threshold: slowThreshold,
        method: metadata.method,
        route: metadata.route,
        status: statusCode,
        requestId: request.id,
      });

      registry.incrementCounter(
        `http_slow_requests_total{route="${metadata.route}"}`,
        'Slow HTTP requests',
      );
    }
  });

  // onError hook - record errors
  app.addHook('onError', async (request, reply, error) => {
    const metadata = REQUEST_METADATA_STORE.get(request);
    if (!metadata) return;

    registry.incrementCounter(
      'http_request_errors_total',
      'HTTP request errors caught by error handler',
    );

    // Log unhandled errors
    if (!reply.sent) {
      request.log.error({
        type: 'unhandled_error',
        error: error.message,
        method: metadata.method,
        route: metadata.route,
        requestId: request.id,
      });
    }
  });
}
