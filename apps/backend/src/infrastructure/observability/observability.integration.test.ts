import { describe, expect, it, beforeEach } from 'vitest';
import {
  getMetricsRegistry,
  resetMetricsRegistry,
} from './metrics-registry.js';
import {
  getBusinessMetrics,
  resetBusinessMetrics,
} from './business-metrics.js';
import { DatabaseMetrics } from './database-metrics.js';

describe('Observability Integration', () => {
  beforeEach(() => {
    resetMetricsRegistry();
    resetBusinessMetrics();
  });

  it('should record business metrics for integrations', () => {
    const metrics = getBusinessMetrics();
    metrics.recordIntegrationRun('success', 'rest-api', 500);

    const registry = getMetricsRegistry();
    const exported = registry.exportMetrics();

    expect(exported).toContain('larcarvalho_integration_runs_total');
    expect(exported).toContain('larcarvalho_integration_runs_by_status_total');
    expect(exported).toContain('larcarvalho_integration_run_duration_seconds');
  });

  it('should track database pool metrics', () => {
    const mockPool = {
      totalCount: 10,
      idleCount: 8,
      waitingCount: 2,
    };

    const dbMetrics = new DatabaseMetrics(() => mockPool);
    dbMetrics.updatePoolMetrics();

    const registry = getMetricsRegistry();
    expect(registry.getGauge('database_pool_total')).toBe(10);
    expect(registry.getGauge('database_pool_idle')).toBe(8);
    expect(registry.getGauge('database_pool_waiting')).toBe(2);
  });

  it('should record slow queries', () => {
    const dbMetrics = new DatabaseMetrics(() => null);
    dbMetrics.recordSlowQuery(1500, 'SELECT');

    const registry = getMetricsRegistry();
    const exported = registry.exportMetrics();

    expect(exported).toContain('larcarvalho_database_slow_queries_total');
  });

  it('should handle data quality issues', () => {
    const metrics = getBusinessMetrics();
    metrics.recordDataQualityIssue('critical', 'open');
    metrics.recordDataQualityIssue('major', 'in_review');
    metrics.recordDataQualityIssue('minor', 'resolved');

    metrics.updateDataQualityGauges(5, 3, 2);

    const registry = getMetricsRegistry();
    expect(registry.getGauge('data_quality_issues_open')).toBe(5);
    expect(registry.getGauge('data_quality_issues_in_review')).toBe(3);
    expect(registry.getGauge('data_quality_issues_critical')).toBe(2);
  });

  it('should track leads', () => {
    const metrics = getBusinessMetrics();
    metrics.recordLead('created');
    metrics.recordLead('converted');
    metrics.recordLead('lost');

    const registry = getMetricsRegistry();
    const exported = registry.exportMetrics();

    expect(exported).toContain('larcarvalho_leads_created_total');
    expect(exported).toContain('larcarvalho_leads_converted_total');
    expect(exported).toContain('larcarvalho_leads_lost_total');
  });

  it('should track public conversion metrics without personal data', () => {
    const metrics = getBusinessMetrics();
    metrics.recordSimulation('started', 'IMOVEL');
    metrics.recordSimulation('completed', 'IMOVEL', 250);
    metrics.recordPublicLeadAttempt('accepted');

    const exported = getMetricsRegistry().exportMetrics();
    expect(exported).toContain('larcarvalho_simulations_total');
    expect(exported).toContain(
      'larcarvalho_simulations_by_category_total{category="IMOVEL"}',
    );
    expect(exported).toContain(
      'larcarvalho_public_lead_attempts_total{status="accepted"}',
    );
    expect(exported).not.toContain('email');
    expect(exported).not.toContain('telefone');
  });
});
