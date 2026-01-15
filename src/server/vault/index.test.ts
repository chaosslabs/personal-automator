import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { VaultService, VaultError } from './index.js';

describe('VaultService', () => {
  let vault: VaultService;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'personal-automator-vault-test-'));
    vault = new VaultService(tempDir);
    vault.initialize();
  });

  afterEach(() => {
    vault.clearKey();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('initialization', () => {
    it('should create master key files on first initialization', () => {
      expect(existsSync(join(tempDir, 'master.key'))).toBe(true);
      expect(existsSync(join(tempDir, 'key.salt'))).toBe(true);
    });

    it('should verify vault is working after initialization', () => {
      expect(vault.verify()).toBe(true);
    });

    it('should reuse existing master key on subsequent initializations', () => {
      const encrypted1 = vault.encrypt('test value');

      // Create new vault instance with same directory
      vault.clearKey();
      const vault2 = new VaultService(tempDir);
      vault2.initialize();

      // Should be able to decrypt with same key
      const decrypted = vault2.decrypt(encrypted1);
      expect(decrypted).toBe('test value');

      vault2.clearKey();
    });

    it('should check if master key exists', () => {
      expect(vault.masterKeyExists()).toBe(true);

      // New temp directory without initialization
      const newTempDir = mkdtempSync(join(tmpdir(), 'vault-test-empty-'));
      const newVault = new VaultService(newTempDir);
      expect(newVault.masterKeyExists()).toBe(false);

      rmSync(newTempDir, { recursive: true, force: true });
    });
  });

  describe('encryption', () => {
    it('should encrypt and decrypt a simple string', () => {
      const plaintext = 'my-secret-api-key-123';
      const encrypted = vault.encrypt(plaintext);
      const decrypted = vault.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt to different ciphertext each time (different IV)', () => {
      const plaintext = 'same-value';
      const encrypted1 = vault.encrypt(plaintext);
      const encrypted2 = vault.encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to the same value
      expect(vault.decrypt(encrypted1)).toBe(plaintext);
      expect(vault.decrypt(encrypted2)).toBe(plaintext);
    });

    it('should handle empty string', () => {
      const plaintext = '';
      const encrypted = vault.encrypt(plaintext);
      const decrypted = vault.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle unicode characters', () => {
      const plaintext = 'secret-with-unicode-🔐-and-日本語';
      const encrypted = vault.encrypt(plaintext);
      const decrypted = vault.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle long strings', () => {
      const plaintext = 'a'.repeat(10000);
      const encrypted = vault.encrypt(plaintext);
      const decrypted = vault.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle strings with special characters', () => {
      const plaintext = 'key=abc123&secret=xyz!@#$%^&*()_+-=[]{}|;:\'",.<>/?`~';
      const encrypted = vault.encrypt(plaintext);
      const decrypted = vault.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle newlines and whitespace', () => {
      const plaintext = 'line1\nline2\r\nline3\ttab\t\t';
      const encrypted = vault.encrypt(plaintext);
      const decrypted = vault.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe('decryption errors', () => {
    it('should throw on invalid base64 input', () => {
      expect(() => vault.decrypt('not-valid-base64!!!')).toThrow(VaultError);
    });

    it('should throw on too short encrypted value', () => {
      // Less than IV + auth tag length (12 + 16 = 28 bytes)
      const shortValue = Buffer.alloc(20).toString('base64');
      expect(() => vault.decrypt(shortValue)).toThrow(VaultError);
    });

    it('should throw on tampered ciphertext', () => {
      const encrypted = vault.encrypt('original value');
      const buffer = Buffer.from(encrypted, 'base64');

      // Tamper with the ciphertext (after IV and auth tag)
      if (buffer.length > 30) {
        buffer[30] = (buffer[30] ?? 0) ^ 0xff;
      }

      const tampered = buffer.toString('base64');
      expect(() => vault.decrypt(tampered)).toThrow(VaultError);
    });

    it('should throw on tampered auth tag', () => {
      const encrypted = vault.encrypt('original value');
      const buffer = Buffer.from(encrypted, 'base64');

      // Tamper with the auth tag (bytes 12-27)
      buffer[15] = (buffer[15] ?? 0) ^ 0xff;

      const tampered = buffer.toString('base64');
      expect(() => vault.decrypt(tampered)).toThrow(VaultError);
    });
  });

  describe('re-encryption', () => {
    it('should re-encrypt with a new IV', () => {
      const plaintext = 'value-to-reencrypt';
      const encrypted1 = vault.encrypt(plaintext);
      const encrypted2 = vault.reEncrypt(encrypted1);

      // Should be different ciphertext
      expect(encrypted2).not.toBe(encrypted1);

      // But both should decrypt to the same value
      expect(vault.decrypt(encrypted1)).toBe(plaintext);
      expect(vault.decrypt(encrypted2)).toBe(plaintext);
    });
  });

  describe('key management', () => {
    it('should throw when trying to encrypt without initialization', () => {
      const newTempDir = mkdtempSync(join(tmpdir(), 'vault-uninit-'));
      const uninitializedVault = new VaultService(newTempDir);

      // Don't call initialize() - should throw
      expect(() => uninitializedVault.encrypt('test')).toThrow(VaultError);

      rmSync(newTempDir, { recursive: true, force: true });
    });

    it('should clear key from memory', () => {
      vault.encrypt('test'); // Verify it works
      vault.clearKey();

      // After clearing, encryption should fail
      expect(() => vault.encrypt('test')).toThrow(VaultError);
    });

    it('should be able to reinitialize after clearing key', () => {
      const encrypted = vault.encrypt('test value');
      vault.clearKey();

      // Reinitialize
      vault.initialize();

      // Should work again and decrypt same value
      const decrypted = vault.decrypt(encrypted);
      expect(decrypted).toBe('test value');
    });
  });

  describe('concurrent operations', () => {
    it('should handle multiple encryptions in sequence', () => {
      const values = ['value1', 'value2', 'value3', 'value4', 'value5'];
      const encrypted = values.map((v) => vault.encrypt(v));
      const decrypted = encrypted.map((e) => vault.decrypt(e));

      expect(decrypted).toEqual(values);
    });
  });

  describe('different vault instances', () => {
    it('should not decrypt values from a different vault', () => {
      const encrypted = vault.encrypt('secret');

      // Create a new vault with different key
      const otherTempDir = mkdtempSync(join(tmpdir(), 'vault-other-'));
      const otherVault = new VaultService(otherTempDir);
      otherVault.initialize();

      // Should fail to decrypt with different key
      expect(() => otherVault.decrypt(encrypted)).toThrow(VaultError);

      otherVault.clearKey();
      rmSync(otherTempDir, { recursive: true, force: true });
    });
  });
});
