import type { ProviderAdapter, ConnectionTestResult, OperationResult, HealthResult } from '../adapter.interface.js';

interface HttpCredentials {
  apiKey?: string;
  bearerToken?: string;
  username?: string;
  password?: string;
  headerName?: string;
}

interface HttpConfig {
  baseUrl: string;
  healthEndpoint?: string;
}

export class GenericHttpAdapter implements ProviderAdapter {
  readonly provider = 'http';
  readonly displayName = 'Generic HTTP';
  readonly supportedOperations = ['get', 'post', 'put', 'patch', 'delete', 'health_check'];

  validateCredentials(_credentials: Record<string, unknown>): { valid: boolean; errors: string[] } {
    return { valid: true, errors: [] };
  }

  private buildHeaders(credentials: HttpCredentials): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (credentials.bearerToken) headers['Authorization'] = `Bearer ${credentials.bearerToken}`;
    else if (credentials.apiKey) headers[credentials.headerName ?? 'X-API-Key'] = credentials.apiKey;
    else if (credentials.username && credentials.password) {
      headers['Authorization'] = `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`;
    }
    return headers;
  }

  async testConnection(config: Record<string, unknown>, credentials: Record<string, unknown>): Promise<ConnectionTestResult> {
    const cfg = config as unknown as HttpConfig;
    if (!cfg.baseUrl) return { success: false, message: 'baseUrl is required' };

    try {
      const url = cfg.healthEndpoint ? `${cfg.baseUrl}${cfg.healthEndpoint}` : cfg.baseUrl;
      const r = await fetch(url, {
        headers: this.buildHeaders(credentials as unknown as HttpCredentials),
        signal: AbortSignal.timeout(10000),
      });
      return r.ok
        ? { success: true, message: `Connected - HTTP ${r.status}` }
        : { success: false, message: `HTTP ${r.status}: ${r.statusText}` };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Connection failed' };
    }
  }

  async getHealth(config: Record<string, unknown>, credentials: Record<string, unknown>): Promise<HealthResult> {
    const start = Date.now();
    const result = await this.testConnection(config, credentials);
    return { healthy: result.success, latencyMs: Date.now() - start, message: result.message };
  }

  async executeOperation(operation: string, config: Record<string, unknown>, credentials: Record<string, unknown>, params: Record<string, unknown>): Promise<OperationResult> {
    const cfg = config as unknown as HttpConfig;
    const url = `${cfg.baseUrl}${params.path ?? ''}`;
    const headers = this.buildHeaders(credentials as unknown as HttpCredentials);

    try {
      const method = operation.toUpperCase();
      const r = await fetch(url, {
        method,
        headers,
        body: ['POST', 'PUT', 'PATCH'].includes(method) ? JSON.stringify(params.body) : undefined,
        signal: AbortSignal.timeout(30000),
      });
      const text = await r.text();
      let data: unknown;
      try { data = JSON.parse(text); } catch { data = text; }
      return { success: r.ok, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Request failed' };
    }
  }
}
