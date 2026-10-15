import type { ProviderAdapter, ConnectionTestResult, OperationResult, HealthResult } from '../adapter.interface.js';
import { logger } from '@/utils/logger.js';

interface GitHubCredentials {
  accessToken?: string;
  appId?: string;
  privateKey?: string;
  webhookSecret?: string;
}

interface GitHubConfig {
  owner?: string;
  repo?: string;
  baseUrl?: string;
}

export class GitHubAdapter implements ProviderAdapter {
  readonly provider = 'github';
  readonly displayName = 'GitHub';
  readonly supportedOperations = [
    'list_repos', 'get_repo', 'list_workflows', 'trigger_workflow',
    'list_runs', 'get_run', 'list_issues', 'create_issue',
    'list_pull_requests', 'get_commits',
  ];

  private getBaseUrl(config: GitHubConfig): string {
    return config.baseUrl ?? 'https://api.github.com';
  }

  private getAuthHeader(credentials: GitHubCredentials): Record<string, string> {
    if (credentials.accessToken) {
      return { Authorization: `Bearer ${credentials.accessToken}` };
    }
    throw new Error('No authentication credentials provided');
  }

  validateCredentials(credentials: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const creds = credentials as GitHubCredentials;

    if (!creds.accessToken && !creds.appId) {
      errors.push('Either accessToken or appId+privateKey is required');
    }
    if (creds.appId && !creds.privateKey) {
      errors.push('privateKey is required when using appId');
    }

    return { valid: errors.length === 0, errors };
  }

  async testConnection(config: Record<string, unknown>, credentials: Record<string, unknown>): Promise<ConnectionTestResult> {
    const creds = credentials as GitHubCredentials;
    const cfg = config as GitHubConfig;

    const validation = this.validateCredentials(credentials);
    if (!validation.valid) {
      return { success: false, message: validation.errors.join('; ') };
    }

    try {
      const response = await fetch(`${this.getBaseUrl(cfg)}/user`, {
        headers: {
          ...this.getAuthHeader(creds),
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (response.status === 200) {
        const data = await response.json() as { login: string };
        return {
          success: true,
          message: `Connected as ${data.login}`,
          details: { login: data.login },
        };
      } else if (response.status === 401) {
        return { success: false, message: 'Invalid credentials' };
      } else {
        return { success: false, message: `GitHub returned status ${response.status}` };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      logger.warn('GitHub connection test failed', { error: message });
      return { success: false, message };
    }
  }

  async getHealth(config: Record<string, unknown>, credentials: Record<string, unknown>): Promise<HealthResult> {
    const start = Date.now();
    try {
      const result = await this.testConnection(config, credentials);
      return {
        healthy: result.success,
        latencyMs: Date.now() - start,
        message: result.message,
        details: result.details,
      };
    } catch {
      return { healthy: false, latencyMs: Date.now() - start, message: 'Health check failed' };
    }
  }

  async executeOperation(
    operation: string,
    config: Record<string, unknown>,
    credentials: Record<string, unknown>,
    params: Record<string, unknown>
  ): Promise<OperationResult> {
    const creds = credentials as GitHubCredentials;
    const cfg = config as GitHubConfig;
    const baseUrl = this.getBaseUrl(cfg);
    const headers = {
      ...this.getAuthHeader(creds),
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    try {
      switch (operation) {
        case 'list_repos': {
          const r = await fetch(`${baseUrl}/user/repos?per_page=${params.per_page ?? 30}&page=${params.page ?? 1}`, { headers, signal: AbortSignal.timeout(15000) });
          const data = await r.json();
          const remaining = r.headers.get('x-ratelimit-remaining');
          const reset = r.headers.get('x-ratelimit-reset');
          return {
            success: r.ok,
            data,
            rateLimitRemaining: remaining ? parseInt(remaining) : undefined,
            rateLimitReset: reset ? new Date(parseInt(reset) * 1000) : undefined,
          };
        }
        case 'list_workflows': {
          const owner = params.owner ?? cfg.owner;
          const repo = params.repo ?? cfg.repo;
          if (!owner || !repo) return { success: false, error: 'owner and repo are required' };
          const r = await fetch(`${baseUrl}/repos/${owner}/${repo}/actions/workflows`, { headers, signal: AbortSignal.timeout(15000) });
          return { success: r.ok, data: await r.json() };
        }
        case 'trigger_workflow': {
          const owner = params.owner ?? cfg.owner;
          const repo = params.repo ?? cfg.repo;
          if (!owner || !repo || !params.workflow_id) return { success: false, error: 'owner, repo, and workflow_id are required' };
          const r = await fetch(`${baseUrl}/repos/${owner}/${repo}/actions/workflows/${params.workflow_id}/dispatches`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ref: params.ref ?? 'main', inputs: params.inputs ?? {} }),
            signal: AbortSignal.timeout(15000),
          });
          return { success: r.status === 204, data: r.status === 204 ? { triggered: true } : await r.json() };
        }
        default:
          return { success: false, error: `Unsupported operation: ${operation}` };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Operation failed' };
    }
  }
}
