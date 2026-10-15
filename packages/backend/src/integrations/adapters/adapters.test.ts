import { describe, it, expect } from 'vitest';
import { GenericHttpAdapter } from './generic-http.adapter.js';
import { SlackAdapter } from './slack.adapter.js';
import { GitHubAdapter } from './github.adapter.js';

describe('Integration Provider Adapters', () => {
  describe('GenericHttpAdapter', () => {
    const adapter = new GenericHttpAdapter();

    it('should identify as http provider with supported operations', () => {
      expect(adapter.provider).toBe('http');
      expect(adapter.displayName).toBe('Generic HTTP');
      expect(adapter.supportedOperations).toContain('get');
      expect(adapter.supportedOperations).toContain('post');
      expect(adapter.supportedOperations).toContain('health_check');
    });

    it('should validate credentials safely', () => {
      const result = adapter.validateCredentials({});
      expect(result.valid).toBe(true);
    });

    it('should reject test connection if baseUrl is missing', async () => {
      const result = await adapter.testConnection({}, {});
      expect(result.success).toBe(false);
      expect(result.message).toContain('baseUrl is required');
    });
  });

  describe('SlackAdapter', () => {
    const adapter = new SlackAdapter();

    it('should validate Slack credentials requiring botToken starting with xoxb-', () => {
      const missingToken = adapter.validateCredentials({});
      expect(missingToken.valid).toBe(false);
      expect(missingToken.errors).toContain('botToken is required');

      const invalidToken = adapter.validateCredentials({ botToken: 'invalid-token' });
      expect(invalidToken.valid).toBe(false);
      expect(invalidToken.errors[0]).toContain('starts with xoxb-');

      const validToken = adapter.validateCredentials({ botToken: 'xoxb-123456789-abcdef' });
      expect(validToken.valid).toBe(true);
      expect(validToken.errors).toHaveLength(0);
    });

    it('should reject testConnection when credentials are invalid without making external calls', async () => {
      const result = await adapter.testConnection({}, { botToken: 'bad_token' });
      expect(result.success).toBe(false);
      expect(result.message).toContain('starts with xoxb-');
    });
  });

  describe('GitHubAdapter', () => {
    const adapter = new GitHubAdapter();

    it('should validate GitHub credentials requiring accessToken or appId+privateKey', () => {
      const empty = adapter.validateCredentials({});
      expect(empty.valid).toBe(false);
      expect(empty.errors).toContain('Either accessToken or appId+privateKey is required');

      const appMissingKey = adapter.validateCredentials({ appId: '12345' });
      expect(appMissingKey.valid).toBe(false);
      expect(appMissingKey.errors).toContain('privateKey is required when using appId');

      const validPat = adapter.validateCredentials({ accessToken: 'ghp_validToken12345' });
      expect(validPat.valid).toBe(true);
    });

    it('should reject testConnection when credentials are missing', async () => {
      const result = await adapter.testConnection({}, {});
      expect(result.success).toBe(false);
      expect(result.message).toContain('Either accessToken or appId+privateKey is required');
    });

    it('should return error for unsupported operations', async () => {
      const result = await adapter.executeOperation(
        'non_existent_op',
        {},
        { accessToken: 'ghp_test' },
        {}
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported operation');
    });
  });
});
