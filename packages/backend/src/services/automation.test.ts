import { describe, it, expect } from 'vitest';

// Backoff calculation logic matching worker and queue specifications
function backoffMs(attempt: number, baseMs = 1000, maxMs = 30000): number {
  return Math.min(baseMs * Math.pow(2, attempt - 1), maxMs);
}

// Circuit breaker logic matching worker specifications
class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private open = false;

  constructor(
    private readonly threshold = 5,
    private readonly cooldownMs = 60000
  ) {}

  isOpen(): boolean {
    if (this.open && Date.now() - this.lastFailure > this.cooldownMs) {
      this.open = false;
      this.failures = 0;
    }
    return this.open;
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.threshold) {
      this.open = true;
    }
  }

  recordSuccess(): void {
    this.open = false;
    this.failures = 0;
  }
}

describe('Automation Lifecycle & Resilience Policies', () => {
  describe('Exponential Backoff Calculation', () => {
    it('should compute exponential delays for retry attempts', () => {
      expect(backoffMs(1, 1000, 30000)).toBe(1000); // 1000 * 2^0
      expect(backoffMs(2, 1000, 30000)).toBe(2000); // 1000 * 2^1
      expect(backoffMs(3, 1000, 30000)).toBe(4000); // 1000 * 2^2
      expect(backoffMs(4, 1000, 30000)).toBe(8000); // 1000 * 2^3
    });

    it('should cap retry delays at maximum configured threshold', () => {
      expect(backoffMs(10, 1000, 30000)).toBe(30000);
      expect(backoffMs(20, 1000, 30000)).toBe(30000);
    });
  });

  describe('Circuit Breaker Resilience Pattern', () => {
    it('should remain closed under normal operations and transient single failures', () => {
      const cb = new CircuitBreaker(3, 5000);
      expect(cb.isOpen()).toBe(false);

      cb.recordFailure();
      expect(cb.isOpen()).toBe(false);

      cb.recordSuccess();
      expect(cb.isOpen()).toBe(false);
    });

    it('should trip open when consecutive failures meet the threshold', () => {
      const cb = new CircuitBreaker(3, 5000);
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.isOpen()).toBe(false);

      cb.recordFailure(); // 3rd failure meets threshold
      expect(cb.isOpen()).toBe(true);
    });

    it('should reset immediately upon successful recovery', () => {
      const cb = new CircuitBreaker(2, 5000);
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.isOpen()).toBe(true);

      cb.recordSuccess();
      expect(cb.isOpen()).toBe(false);
    });
  });
});
