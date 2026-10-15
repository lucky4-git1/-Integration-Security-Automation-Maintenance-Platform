import type { ProviderAdapter, ConnectionTestResult, OperationResult, HealthResult } from '../adapter.interface.js';
import { logger } from '@/utils/logger.js';
import { createHmac, timingSafeEqual } from 'crypto';

interface SlackCredentials {
  botToken?: string;
  signingSecret?: string;
}

export class SlackAdapter implements ProviderAdapter {
  readonly provider = 'slack';
  readonly displayName = 'Slack';
  readonly supportedOperations = [
    'post_message', 'list_channels', 'get_channel', 'upload_file',
    'list_users', 'get_user', 'update_message', 'delete_message',
  ];

  validateCredentials(credentials: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const creds = credentials as unknown as SlackCredentials;
    if (!creds.botToken) errors.push('botToken is required');
    else if (!creds.botToken.startsWith('xoxb-')) errors.push('botToken must be a bot token (starts with xoxb-)');
    return { valid: errors.length === 0, errors };
  }

  async testConnection(_config: Record<string, unknown>, credentials: Record<string, unknown>): Promise<ConnectionTestResult> {
    const creds = credentials as unknown as SlackCredentials;
    const validation = this.validateCredentials(credentials);
    if (!validation.valid) return { success: false, message: validation.errors.join('; ') };

    try {
      const r = await fetch('https://slack.com/api/auth.test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${creds.botToken}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });
      const data = await r.json() as { ok: boolean; user?: string; team?: string; error?: string };
      if (data.ok) {
        return { success: true, message: `Connected as ${data.user} in ${data.team}`, details: { user: data.user, team: data.team } };
      }
      return { success: false, message: data.error ?? 'Authentication failed' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      logger.warn('Slack connection test failed', { error: message });
      return { success: false, message };
    }
  }

  async getHealth(config: Record<string, unknown>, credentials: Record<string, unknown>): Promise<HealthResult> {
    const start = Date.now();
    const result = await this.testConnection(config, credentials);
    return { healthy: result.success, latencyMs: Date.now() - start, message: result.message };
  }

  verifyWebhookSignature(signingSecret: string, rawBody: string, timestamp: string, signature: string): boolean {
    const sigBaseString = `v0:${timestamp}:${rawBody}`;
    const hmac = createHmac('sha256', signingSecret).update(sigBaseString).digest('hex');
    const computedSig = `v0=${hmac}`;
    try {
      return timingSafeEqual(Buffer.from(computedSig), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  async executeOperation(
    operation: string,
    _config: Record<string, unknown>,
    credentials: Record<string, unknown>,
    params: Record<string, unknown>
  ): Promise<OperationResult> {
    const creds = credentials as SlackCredentials;
    const headers = {
      'Authorization': `Bearer ${creds.botToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    };

    try {
      switch (operation) {
        case 'post_message': {
          if (!params.channel || !params.text) return { success: false, error: 'channel and text are required' };
          const r = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers,
            body: JSON.stringify({ channel: params.channel, text: params.text, blocks: params.blocks }),
            signal: AbortSignal.timeout(15000),
          });
          const data = await r.json() as { ok: boolean; ts?: string; error?: string };
          return { success: data.ok, data: data.ok ? { ts: data.ts } : undefined, error: data.ok ? undefined : data.error };
        }
        case 'list_channels': {
          const r = await fetch(`https://slack.com/api/conversations.list?limit=${params.limit ?? 100}&exclude_archived=true`, {
            headers,
            signal: AbortSignal.timeout(15000),
          });
          const data = await r.json() as { ok: boolean; channels?: unknown[]; error?: string };
          return { success: data.ok, data: data.channels, error: data.ok ? undefined : data.error };
        }
        case 'list_users': {
          const r = await fetch('https://slack.com/api/users.list', { headers, signal: AbortSignal.timeout(15000) });
          const data = await r.json() as { ok: boolean; members?: unknown[]; error?: string };
          return { success: data.ok, data: data.members, error: data.ok ? undefined : data.error };
        }
        default:
          return { success: false, error: `Unsupported operation: ${operation}` };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Operation failed' };
    }
  }
}
