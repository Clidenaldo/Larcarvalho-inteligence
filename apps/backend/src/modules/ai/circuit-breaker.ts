/**
 * Minimal in-memory circuit protection per provider+model.
 *
 * Single-instance limitation: state is NOT shared across processes. With
 * multiple backend instances each keeps its own counters, so a failing
 * provider may still receive some traffic during an outage. This is
 * documented in docs/IA_PRODUCAO.md; a distributed breaker is out of scope.
 */
export interface CircuitState {
  failures: number;
  openedAt: number | null;
}

const FAILURE_THRESHOLD = 5;
const COOLDOWN_MS = 60_000;

export class ProviderCircuitBreaker {
  private readonly states = new Map<string, CircuitState>();

  isOpen(key: string, now = Date.now()): boolean {
    const state = this.states.get(key);
    if (!state || state.openedAt === null) return false;
    if (now - state.openedAt >= COOLDOWN_MS) {
      this.states.set(key, { failures: 0, openedAt: null });
      return false;
    }
    return true;
  }

  recordSuccess(key: string): void {
    this.states.set(key, { failures: 0, openedAt: null });
  }

  recordFailure(key: string, now = Date.now()): void {
    const state = this.states.get(key) ?? { failures: 0, openedAt: null };
    const failures = state.failures + 1;
    this.states.set(
      key,
      failures >= FAILURE_THRESHOLD
        ? { failures, openedAt: now }
        : { failures, openedAt: null },
    );
  }
}
