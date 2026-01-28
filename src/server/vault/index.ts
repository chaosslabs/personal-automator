import { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Encryption constants
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits (recommended for GCM)
const AUTH_TAG_LENGTH = 16; // 128 bits
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_DIGEST = 'sha256';
const SALT_LENGTH = 32;

// File names
const MASTER_KEY_FILENAME = 'master.key';
const KEY_SALT_FILENAME = 'key.salt';

/**
 * Encrypted value format:
 * [iv (12 bytes)][auth_tag (16 bytes)][ciphertext (variable)]
 * Stored as base64 string
 */

export interface EncryptedValue {
  iv: string; // base64
  authTag: string; // base64
  ciphertext: string; // base64
}

/**
 * VaultService handles secure credential encryption and master key management.
 *
 * Security Model:
 * - Master key is randomly generated on first use
 * - Master key is stored on disk with restricted permissions
 * - Derived key is created using PBKDF2 with a random salt
 * - Each credential is encrypted with AES-256-GCM using a unique IV
 * - Auth tags provide authenticated encryption (tamper detection)
 */
export class VaultService {
  private dataDir: string;
  private derivedKey: Buffer | null = null;

  constructor(dataDir?: string) {
    // Support DATA_DIR env var for container deployments (Railway, Docker, etc.)
    const defaultDataDir = process.env['DATA_DIR'] ?? join(homedir(), '.personal-automator');
    this.dataDir = dataDir ?? defaultDataDir;
  }

  /**
   * Initialize the vault (ensure master key exists)
   */
  initialize(): void {
    // Ensure data directory exists
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
    }

    // Generate master key if it doesn't exist
    if (!this.masterKeyExists()) {
      this.generateMasterKey();
    }

    // Derive the encryption key
    this.deriveKey();
  }

  /**
   * Check if the master key exists
   */
  masterKeyExists(): boolean {
    const keyPath = this.getMasterKeyPath();
    const saltPath = this.getSaltPath();
    return existsSync(keyPath) && existsSync(saltPath);
  }

  /**
   * Get the path to the master key file
   */
  private getMasterKeyPath(): string {
    return join(this.dataDir, MASTER_KEY_FILENAME);
  }

  /**
   * Get the path to the salt file
   */
  private getSaltPath(): string {
    return join(this.dataDir, KEY_SALT_FILENAME);
  }

  /**
   * Generate a new master key and salt
   */
  private generateMasterKey(): void {
    const masterKey = randomBytes(KEY_LENGTH);
    const salt = randomBytes(SALT_LENGTH);

    const keyPath = this.getMasterKeyPath();
    const saltPath = this.getSaltPath();

    // Write master key with restricted permissions (owner read only)
    writeFileSync(keyPath, masterKey);
    chmodSync(keyPath, 0o400);

    // Write salt with restricted permissions
    writeFileSync(saltPath, salt);
    chmodSync(saltPath, 0o400);

    console.log('Generated new master key for credential vault');
  }

  /**
   * Load the master key from disk
   */
  private loadMasterKey(): Buffer {
    const keyPath = this.getMasterKeyPath();
    if (!existsSync(keyPath)) {
      throw new VaultError('Master key not found. Run initialize() first.');
    }
    return readFileSync(keyPath);
  }

  /**
   * Load the salt from disk
   */
  private loadSalt(): Buffer {
    const saltPath = this.getSaltPath();
    if (!existsSync(saltPath)) {
      throw new VaultError('Salt file not found. Run initialize() first.');
    }
    return readFileSync(saltPath);
  }

  /**
   * Derive the encryption key from the master key using PBKDF2
   */
  private deriveKey(): void {
    const masterKey = this.loadMasterKey();
    const salt = this.loadSalt();

    this.derivedKey = pbkdf2Sync(masterKey, salt, PBKDF2_ITERATIONS, KEY_LENGTH, PBKDF2_DIGEST);
  }

  /**
   * Get the derived encryption key
   */
  private getKey(): Buffer {
    if (!this.derivedKey) {
      throw new VaultError('Vault not initialized. Call initialize() first.');
    }
    return this.derivedKey;
  }

  /**
   * Encrypt a credential value
   * @param plaintext The credential value to encrypt
   * @returns Base64-encoded encrypted value (iv + authTag + ciphertext)
   */
  encrypt(plaintext: string): string {
    const key = this.getKey();
    const iv = randomBytes(IV_LENGTH);

    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Combine iv + authTag + ciphertext into a single buffer
    const combined = Buffer.concat([iv, authTag, ciphertext]);
    return combined.toString('base64');
  }

  /**
   * Decrypt a credential value
   * @param encryptedBase64 Base64-encoded encrypted value
   * @returns Decrypted plaintext value
   */
  decrypt(encryptedBase64: string): string {
    const key = this.getKey();
    const combined = Buffer.from(encryptedBase64, 'base64');

    if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
      throw new VaultError('Invalid encrypted value: too short');
    }

    // Extract iv, authTag, and ciphertext
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    try {
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return plaintext.toString('utf8');
    } catch (error) {
      // Authentication failed or decryption error
      throw new VaultError('Failed to decrypt credential: authentication failed or data corrupted');
    }
  }

  /**
   * Check if encryption/decryption is working correctly
   */
  verify(): boolean {
    try {
      const testValue = 'vault-test-' + Date.now();
      const encrypted = this.encrypt(testValue);
      const decrypted = this.decrypt(encrypted);
      return decrypted === testValue;
    } catch {
      return false;
    }
  }

  /**
   * Re-encrypt a value with a new IV (useful for credential rotation)
   */
  reEncrypt(encryptedBase64: string): string {
    const plaintext = this.decrypt(encryptedBase64);
    return this.encrypt(plaintext);
  }

  /**
   * Securely clear the derived key from memory
   */
  clearKey(): void {
    if (this.derivedKey) {
      this.derivedKey.fill(0);
      this.derivedKey = null;
    }
  }
}

/**
 * Custom error class for vault operations
 */
export class VaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultError';
  }
}

// Singleton instance
let vaultInstance: VaultService | null = null;

/**
 * Get the vault service instance
 */
export function getVault(dataDir?: string): VaultService {
  if (!vaultInstance) {
    vaultInstance = new VaultService(dataDir);
    vaultInstance.initialize();
  }
  return vaultInstance;
}

/**
 * Close/clear the vault (for testing/cleanup)
 */
export function closeVault(): void {
  if (vaultInstance) {
    vaultInstance.clearKey();
    vaultInstance = null;
  }
}

export default VaultService;

// Re-export credential injector
export { CredentialInjector, createCredentialsForExecution } from './credential-injector.js';
export type { CredentialsObject, CredentialInjectionResult } from './credential-injector.js';
