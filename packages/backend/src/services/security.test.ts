import { describe, it, expect } from 'vitest';

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

function calculateRiskScore(severity: Severity, confidence: string): number {
  const severityWeight: Record<Severity, number> = {
    critical: 10,
    high: 8,
    medium: 5,
    low: 2,
    info: 0,
  };
  const confidenceMultiplier: Record<string, number> = {
    high: 1.0,
    medium: 0.75,
    low: 0.5,
  };

  const base = severityWeight[severity] ?? 0;
  const mult = confidenceMultiplier[confidence] ?? 0.5;
  return Number((base * mult).toFixed(1));
}

function redactSensitiveData(payload: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ['password', 'secret', 'token', 'apiKey', 'credentials', 'authorization'];
  const sanitized = { ...payload };

  for (const [key, val] of Object.entries(sanitized)) {
    if (sensitiveKeys.some((s) => key.toLowerCase().includes(s.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      sanitized[key] = redactSensitiveData(val as Record<string, unknown>);
    }
  }

  return sanitized;
}

describe('Security Assessment & Finding Classification', () => {
  describe('Risk Score Calculation', () => {
    it('should assign maximum score to high-confidence critical findings', () => {
      const score = calculateRiskScore('critical', 'high');
      expect(score).toBe(10);
    });

    it('should scale down score based on lower confidence levels', () => {
      const highMedConfidence = calculateRiskScore('high', 'medium');
      expect(highMedConfidence).toBe(6.0); // 8 * 0.75

      const mediumLowConfidence = calculateRiskScore('medium', 'low');
      expect(mediumLowConfidence).toBe(2.5); // 5 * 0.5
    });

    it('should give 0 risk score to informational findings', () => {
      expect(calculateRiskScore('info', 'high')).toBe(0);
    });
  });

  describe('Secret Redaction in Findings & Telemetry', () => {
    it('should recursively redact sensitive fields from evidence records', () => {
      const rawEvidence = {
        endpoint: 'https://api.service.internal/v1/sync',
        authorization: 'Bearer secret_access_token_9999',
        apiKey: 'super-secret-key',
        nested: {
          clientSecret: 'client-sec-1234',
          publicName: 'Integration Service',
        },
      };

      const redacted = redactSensitiveData(rawEvidence);
      expect(redacted.endpoint).toBe('https://api.service.internal/v1/sync');
      expect(redacted.authorization).toBe('[REDACTED]');
      expect(redacted.apiKey).toBe('[REDACTED]');
      expect((redacted.nested as Record<string, unknown>).clientSecret).toBe('[REDACTED]');
      expect((redacted.nested as Record<string, unknown>).publicName).toBe('Integration Service');
    });
  });
});
