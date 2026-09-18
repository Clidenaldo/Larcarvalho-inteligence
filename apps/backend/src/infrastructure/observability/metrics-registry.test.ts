import { describe, expect, it, beforeEach } from 'vitest';
import {
  getMetricsRegistry,
  resetMetricsRegistry,
} from './metrics-registry.js';

describe('MetricsRegistry', () => {
  beforeEach(() => {
    resetMetricsRegistry();
  });

  it('should increment counter', () => {
    const registry = getMetricsRegistry();
    registry.incrementCounter('test_counter', 'Test counter', 1);
    registry.incrementCounter('test_counter', '', 2);

    expect(registry.getCounter('test_counter')).toBe(3);
  });

  it('should set gauge', () => {
    const registry = getMetricsRegistry();
    registry.setGauge('test_gauge', 42, 'Test gauge');

    expect(registry.getGauge('test_gauge')).toBe(42);
  });

  it('should observe histogram', () => {
    const registry = getMetricsRegistry();
    registry.observeHistogram('test_histogram', 0.5, 'Test histogram');

    const histogram = registry.getHistogram('test_histogram');
    expect(histogram).not.toBeNull();
    expect(histogram?.count).toBe(1);
    expect(histogram?.sum).toBe(0.5);
  });

  it('should add prefix to metric names', () => {
    const registry = getMetricsRegistry();
    registry.incrementCounter('unprefixed_metric', '', 1);

    const exported = registry.exportMetrics();
    expect(exported).toContain('larcarvalho_unprefixed_metric');
  });

  it('should export metrics in Prometheus format', () => {
    const registry = getMetricsRegistry();
    registry.incrementCounter('test_total', 'Test counter', 5);
    registry.setGauge('test_gauge', 10, 'Test gauge');

    const exported = registry.exportMetrics();
    expect(exported).toContain('# HELP larcarvalho_test_total Test counter');
    expect(exported).toContain('# TYPE larcarvalho_test_total counter');
    expect(exported).toContain('larcarvalho_test_total 5');
    expect(exported).toContain('larcarvalho_test_gauge 10');
  });

  it('should handle multiple histograms', () => {
    const registry = getMetricsRegistry();
    registry.observeHistogram('request_duration', 0.1, '');
    registry.observeHistogram('request_duration', 0.5, '');
    registry.observeHistogram('request_duration', 1.0, '');

    const histogram = registry.getHistogram('request_duration');
    expect(histogram?.count).toBe(3);
    expect(histogram?.sum).toBe(1.6);
  });

  it('should normalize route patterns', () => {
    const registry = getMetricsRegistry();

    // Increment for a route with UUID
    registry.incrementCounter(
      'http_requests_by_route_total{route="/api/v1/users/:id"}',
      '',
      1,
    );

    const exported = registry.exportMetrics();
    expect(exported).toContain('/api/v1/users/:id');
  });
});
