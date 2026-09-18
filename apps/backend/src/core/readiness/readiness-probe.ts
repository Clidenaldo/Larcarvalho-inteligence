export interface ReadinessProbeResult {
  readonly name: string;
  readonly status: 'not_ready' | 'ready';
}

export interface ReadinessProbe {
  readonly name: string;
  check(): Promise<boolean>;
}

export async function runReadinessProbe(
  probe: ReadinessProbe,
): Promise<ReadinessProbeResult> {
  try {
    const isReady = await probe.check();
    return { name: probe.name, status: isReady ? 'ready' : 'not_ready' };
  } catch {
    return { name: probe.name, status: 'not_ready' };
  }
}
