import { getMetricsRegistry } from './metrics-registry.js';

/**
 * Business Metrics
 * Tracks operational metrics for:
 * - Integrations (runs, success/failure)
 * - Imports (completed, failed, records processed)
 * - Data Quality (issues by status)
 * - Leads (created, converted, lost)
 */

export class BusinessMetrics {
  recordAnalyticsEvent(status: 'received' | 'rejected' | 'processed'): void {
    getMetricsRegistry().incrementCounter(
      `analytics_events_${status}_total`,
      `Analytics events ${status}`,
    );
  }

  recordAnalyticsEventProcessingDuration(durationMs: number): void {
    getMetricsRegistry().observeHistogram(
      'analytics_event_processing_duration',
      durationMs / 1000,
      'Analytics event processing duration',
    );
  }
  recordIntegrationRun(
    status: 'success' | 'partial' | 'failed',
    connectorType?: string,
    duration?: number,
  ): void {
    const registry = getMetricsRegistry();

    registry.incrementCounter(
      'integration_runs_total',
      'Total integration runs',
    );

    registry.incrementCounter(
      `integration_runs_by_status_total{status="${status}"}`,
      'Integration runs by status',
    );

    if (connectorType) {
      registry.incrementCounter(
        `integration_runs_by_connector_total{connector="${connectorType}"}`,
        'Integration runs by connector',
      );
    }

    if (duration) {
      registry.observeHistogram(
        'integration_run_duration_seconds',
        duration / 1000,
        'Integration run duration',
      );
    }
  }

  recordIntegrationRecords(
    action: 'received' | 'created' | 'updated' | 'rejected',
    count: number,
  ): void {
    const registry = getMetricsRegistry();

    registry.incrementCounter(
      `integration_records_${action}_total`,
      `Integration records ${action}`,
      count,
    );
  }

  recordImport(
    status: 'completed' | 'failed' | 'partial',
    recordsProcessed?: number,
  ): void {
    const registry = getMetricsRegistry();

    registry.incrementCounter('imports_total', 'Total imports');

    registry.incrementCounter(
      `imports_by_status_total{status="${status}"}`,
      'Imports by status',
    );

    if (recordsProcessed && recordsProcessed > 0) {
      registry.incrementCounter(
        'import_records_processed_total',
        'Records processed in imports',
        recordsProcessed,
      );
    }
  }

  recordDataQualityIssue(
    severity: 'critical' | 'major' | 'minor',
    status: 'open' | 'in_review' | 'resolved',
  ): void {
    const registry = getMetricsRegistry();

    registry.incrementCounter(
      `data_quality_issues_total{severity="${severity}",status="${status}"}`,
      'Data quality issues',
    );
  }

  recordLead(action: 'created' | 'converted' | 'lost'): void {
    const registry = getMetricsRegistry();

    registry.incrementCounter(`leads_${action}_total`, `Leads ${action}`);
  }

  recordSimulation(
    status: 'started' | 'completed' | 'failed',
    category?: string,
    duration?: number,
  ): void {
    const registry = getMetricsRegistry();
    registry.incrementCounter('simulations_total', 'Public simulations');
    registry.incrementCounter(
      `simulations_by_status_total{status="${status}"}`,
      'Public simulations by status',
    );
    if (category) {
      registry.incrementCounter(
        `simulations_by_category_total{category="${category}"}`,
        'Public simulations by category',
      );
    }
    if (duration !== undefined) {
      registry.observeHistogram(
        'simulation_duration_seconds',
        duration / 1000,
        'Public simulation duration',
      );
    }
  }

  recordPublicLeadAttempt(status: 'accepted' | 'failed'): void {
    getMetricsRegistry().incrementCounter(
      `public_lead_attempts_total{status="${status}"}`,
      'Public lead attempts',
    );
  }

  updateDataQualityGauges(
    openCount: number,
    inReviewCount: number,
    criticalCount: number,
  ): void {
    const registry = getMetricsRegistry();

    registry.setGauge(
      'data_quality_issues_open',
      openCount,
      'Open data quality issues',
    );

    registry.setGauge(
      'data_quality_issues_in_review',
      inReviewCount,
      'Data quality issues in review',
    );

    registry.setGauge(
      'data_quality_issues_critical',
      criticalCount,
      'Critical data quality issues',
    );
  }
}

// Global singleton
let globalBusinessMetrics: BusinessMetrics | null = null;

export function getBusinessMetrics(): BusinessMetrics {
  if (!globalBusinessMetrics) {
    globalBusinessMetrics = new BusinessMetrics();
  }
  return globalBusinessMetrics;
}

export function resetBusinessMetrics(): void {
  globalBusinessMetrics = null;
}
