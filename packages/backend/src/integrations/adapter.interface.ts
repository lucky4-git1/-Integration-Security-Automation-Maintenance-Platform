export interface ConnectionTestResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface OperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  rateLimitRemaining?: number;
  rateLimitReset?: Date;
}

export interface HealthResult {
  healthy: boolean;
  latencyMs: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface ProviderAdapter {
  readonly provider: string;
  readonly displayName: string;
  readonly supportedOperations: string[];

  testConnection(config: Record<string, unknown>, credentials: Record<string, unknown>): Promise<ConnectionTestResult>;
  validateCredentials(credentials: Record<string, unknown>): { valid: boolean; errors: string[] };
  getHealth(config: Record<string, unknown>, credentials: Record<string, unknown>): Promise<HealthResult>;
  executeOperation(
    operation: string,
    config: Record<string, unknown>,
    credentials: Record<string, unknown>,
    params: Record<string, unknown>
  ): Promise<OperationResult>;
}
