/**
 * Metrics Registry - Centralized metric collection
 * Compatible with Prometheus exposition format
 * No external dependencies - in-memory storage
 */

export interface MetricValue {
  name: string;
  help: string;
  type: 'counter' | 'gauge' | 'histogram';
  labels?: Record<string, string>;
  value: number;
  timestamp?: number;
}

export interface HistogramBucket {
  le: number;
  count: number;
}

export interface HistogramMetric {
  name: string;
  help: string;
  type: 'histogram';
  labels?: Record<string, string>;
  buckets: HistogramBucket[];
  sum: number;
  count: number;
}

export class MetricsRegistry {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, Map<number, number>>();
  private histogramMetadata = new Map<string, { sum: number; count: number }>();
  private metricHelp = new Map<string, string>();

  private static readonly PREFIX = 'larcarvalho_';
  private static readonly HISTOGRAM_BUCKETS = [
    0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
  ];

  incrementCounter(name: string, help?: string, value = 1): void {
    const prefixed = this.prefixName(name);
    if (help) {
      this.metricHelp.set(prefixed, help);
    }
    this.counters.set(prefixed, (this.counters.get(prefixed) ?? 0) + value);
  }

  setGauge(name: string, value: number, help?: string): void {
    const prefixed = this.prefixName(name);
    if (help) {
      this.metricHelp.set(prefixed, help);
    }
    this.gauges.set(prefixed, value);
  }

  observeHistogram(name: string, duration: number, help?: string): void {
    const prefixed = this.prefixName(name);
    if (help) {
      this.metricHelp.set(prefixed, help);
    }

    // Initialize histogram if needed
    if (!this.histograms.has(prefixed)) {
      this.histograms.set(prefixed, new Map());
      this.histogramMetadata.set(prefixed, { sum: 0, count: 0 });
    }

    // Record in buckets
    const buckets = this.histograms.get(prefixed)!;
    for (const bucket of MetricsRegistry.HISTOGRAM_BUCKETS) {
      if (duration <= bucket) {
        buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
      }
    }
    buckets.set(Infinity, (buckets.get(Infinity) ?? 0) + 1);

    // Update sum and count
    const metadata = this.histogramMetadata.get(prefixed)!;
    metadata.sum += duration;
    metadata.count += 1;
  }

  getCounter(name: string): number {
    return this.counters.get(this.prefixName(name)) ?? 0;
  }

  getGauge(name: string): number {
    return this.gauges.get(this.prefixName(name)) ?? 0;
  }

  getHistogram(name: string): HistogramMetric | null {
    const prefixed = this.prefixName(name);
    const buckets = this.histograms.get(prefixed);
    const metadata = this.histogramMetadata.get(prefixed);

    if (!buckets || !metadata) {
      return null;
    }

    const bucketArray: HistogramBucket[] = [];
    for (const bucketLe of MetricsRegistry.HISTOGRAM_BUCKETS) {
      bucketArray.push({
        le: bucketLe,
        count: buckets.get(bucketLe) ?? 0,
      });
    }
    bucketArray.push({
      le: Infinity,
      count: buckets.get(Infinity) ?? 0,
    });

    return {
      name: prefixed,
      help: this.metricHelp.get(prefixed) ?? '',
      type: 'histogram',
      buckets: bucketArray,
      sum: metadata.sum,
      count: metadata.count,
    };
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.histogramMetadata.clear();
  }

  /**
   * Export metrics in Prometheus text format
   */
  exportMetrics(): string {
    const lines: string[] = [];

    // Export counters
    for (const [name, value] of this.counters.entries()) {
      const help = this.metricHelp.get(name);
      if (help) {
        lines.push(`# HELP ${name} ${help}`);
        lines.push(`# TYPE ${name} counter`);
      }
      lines.push(`${name} ${value}`);
      lines.push('');
    }

    // Export gauges
    for (const [name, value] of this.gauges.entries()) {
      const help = this.metricHelp.get(name);
      if (help) {
        lines.push(`# HELP ${name} ${help}`);
        lines.push(`# TYPE ${name} gauge`);
      }
      lines.push(`${name} ${value}`);
      lines.push('');
    }

    // Export histograms
    for (const [name] of this.histograms.entries()) {
      const histogram = this.getHistogram(name);
      if (histogram) {
        const help = this.metricHelp.get(name);
        if (help) {
          lines.push(`# HELP ${name} ${help}`);
          lines.push(`# TYPE ${name} histogram`);
        }
        for (const bucket of histogram.buckets) {
          lines.push(
            `${name}_bucket{le="${bucket.le === Infinity ? '+Inf' : bucket.le}"} ${bucket.count}`,
          );
        }
        lines.push(`${name}_sum ${histogram.sum}`);
        lines.push(`${name}_count ${histogram.count}`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  private prefixName(name: string): string {
    if (name.startsWith(MetricsRegistry.PREFIX)) {
      return name;
    }
    return MetricsRegistry.PREFIX + name;
  }
}

// Global singleton registry
let globalRegistry: MetricsRegistry | null = null;

export function getMetricsRegistry(): MetricsRegistry {
  if (!globalRegistry) {
    globalRegistry = new MetricsRegistry();
  }
  return globalRegistry;
}

export function resetMetricsRegistry(): void {
  globalRegistry = null;
}
