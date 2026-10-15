import { describe, it, expect } from 'vitest';
import {
  encrypt,
  decrypt,
  hashApiKey,
  generateToken,
  generateApiKey,
  timingSafeEqual,
} from './crypto.js';

describe('Crypto Utilities', () => {
  describe('AES-256-GCM Encryption / Decryption', () => {
    it('should successfully encrypt and decrypt a sensitive credential payload', () => {
      const plaintext = JSON.stringify({
        apiKey: 'sk_live_1234567890abcdef',
        secretToken: 'secret-token-xyz',
      });

      const encrypted = encrypt(plaintext);
      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted.split(':')).toHaveLength(3); // iv:authTag:ciphertext

      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
      const parsed = JSON.parse(decrypted);
      expect(parsed.apiKey).toBe('sk_live_1234567890abcdef');
    });

    it('should fail decryption if the ciphertext is tampered with', () => {
      const plaintext = 'top-secret-credentials';
      const encrypted = encrypt(plaintext);
      const [iv, authTag, ciphertext] = encrypted.split(':');

      // Tamper with the ciphertext
      const tamperedCiphertext = ciphertext.slice(0, -2) + (ciphertext.endsWith('0') ? '1' : '0');
      const tamperedPayload = `${iv}:${authTag}:${tamperedCiphertext}`;

      expect(() => decrypt(tamperedPayload)).toThrow();
    });

    it('should reject malformed encrypted payload strings', () => {
      expect(() => decrypt('invalid-format')).toThrow('Invalid encrypted data format');
      expect(() => decrypt('part1:part2')).toThrow('Invalid encrypted data format');
    });
  });

  describe('API Key Hashing & Generation', () => {
    it('should generate consistent SHA-256 hash for identical keys', () => {
      const key = 'plat_testkey123456';
      const hash1 = hashApiKey(key);
      const hash2 = hashApiKey(key);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex string length
    });

    it('should produce different hashes for different keys', () => {
      const hash1 = hashApiKey('plat_key_A');
      const hash2 = hashApiKey('plat_key_B');
      expect(hash1).not.toBe(hash2);
    });

    it('should generate properly formatted API keys with prefix', () => {
      const { key, prefix, hash } = generateApiKey('test');
      expect(key.startsWith('test_')).toBe(true);
      expect(prefix).toBe('test');
      expect(hash).toHaveLength(64);
      expect(hash).toBe(hashApiKey(key));
    });
  });

  describe('Random Tokens & Timing-Safe Comparison', () => {
    it('should generate hex tokens of requested length', () => {
      const token = generateToken(16);
      expect(token).toHaveLength(32); // 16 bytes = 32 hex chars
    });

    it('should perform timing-safe string comparison correctly', () => {
      expect(timingSafeEqual('correct-token', 'correct-token')).toBe(true);
      expect(timingSafeEqual('correct-token', 'wrong-token-x')).toBe(false);
      expect(timingSafeEqual('token', 'longer-token')).toBe(false);
    });
  });
});
