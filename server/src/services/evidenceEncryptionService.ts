import crypto from 'crypto';

export interface EncryptedEvidenceEnvelope {
  formatVersion: 'trustfabric-envelope-v1';
  algorithm: 'AES-256-GCM';
  ciphertextBase64: string;
  ivHex: string;
  authTagHex: string;
  encryptedDekHex: string;
  originalSha256: string;
  mimeType: string;
  sizeBytes: number;
  encryptedAt: string;
  keyFingerprint: string;
}

export interface DecryptionResult {
  plaintext: Buffer;
  mimeType: string;
  sha256Matched: boolean;
  decryptedAt: string;
}

/**
 * Enterprise envelope encryption service for evidence and identity documents.
 * Guarantees zero unencrypted PII, tax identifiers, or invoices are exposed to public IPFS gateways.
 */
export class EvidenceEncryptionService {
  private static instance: EvidenceEncryptionService;
  private masterKek: Buffer; // Master Key Encryption Key (derived from secure env or fallback in dev)
  private keyFingerprint: string;

  private constructor() {
    const rawKey = process.env.EVIDENCE_ENCRYPTION_MASTER_KEY || 'trustfabric-default-kek-dev-2026-secure-envelope-master-key';
    // Derive standard 32-byte (256-bit) KEK using SHA-256
    this.masterKek = crypto.createHash('sha256').update(rawKey).digest();
    this.keyFingerprint = crypto.createHash('sha256').update(this.masterKek).digest('hex').substring(0, 16);
  }

  public static getInstance(): EvidenceEncryptionService {
    if (!EvidenceEncryptionService.instance) {
      EvidenceEncryptionService.instance = new EvidenceEncryptionService();
    }
    return EvidenceEncryptionService.instance;
  }

  /**
   * Encrypts sensitive file buffer using AES-256-GCM with unique ephemeral DEK (envelope pattern)
   */
  public encryptDocument(
    rawBuffer: Buffer,
    mimeType: string,
    customKek?: Buffer
  ): { envelope: EncryptedEvidenceEnvelope; serializedPayload: Buffer } {
    // 1. Calculate original plaintext hash for integrity verification
    const originalSha256 = crypto.createHash('sha256').update(rawBuffer).digest('hex');

    // 2. Generate unique ephemeral 32-byte DEK (Data Encryption Key)
    const dek = crypto.randomBytes(32);

    // 3. Generate unique 12-byte IV for GCM
    const iv = crypto.randomBytes(12);

    // 4. Encrypt raw payload with AES-256-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
    const ciphertext = Buffer.concat([cipher.update(rawBuffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // 5. Wrap (encrypt) the ephemeral DEK with the master KEK (Key Encryption Key)
    const kekToUse = customKek || this.masterKek;
    const kekIv = crypto.randomBytes(12);
    const kekCipher = crypto.createCipheriv('aes-256-gcm', kekToUse, kekIv);
    const wrappedDek = Buffer.concat([kekCipher.update(dek), kekCipher.final()]);
    const wrappedDekTag = kekCipher.getAuthTag();

    // Combined encrypted DEK: kekIv (12) + wrappedDekTag (16) + wrappedDek (32) = 60 bytes
    const encryptedDek = Buffer.concat([kekIv, wrappedDekTag, wrappedDek]);

    const envelope: EncryptedEvidenceEnvelope = {
      formatVersion: 'trustfabric-envelope-v1',
      algorithm: 'AES-256-GCM',
      ciphertextBase64: ciphertext.toString('base64'),
      ivHex: iv.toString('hex'),
      authTagHex: authTag.toString('hex'),
      encryptedDekHex: encryptedDek.toString('hex'),
      originalSha256,
      mimeType,
      sizeBytes: rawBuffer.length,
      encryptedAt: new Date().toISOString(),
      keyFingerprint: this.keyFingerprint,
    };

    const serializedPayload = Buffer.from(JSON.stringify(envelope, null, 2), 'utf8');

    return { envelope, serializedPayload };
  }

  /**
   * Decrypts encrypted envelope and verifies cryptographic integrity against originalSha256
   */
  public decryptDocument(
    envelope: EncryptedEvidenceEnvelope,
    customKek?: Buffer
  ): DecryptionResult {
    const kekToUse = customKek || this.masterKek;

    // 1. Unwrap the ephemeral DEK
    const encDekBuf = Buffer.from(envelope.encryptedDekHex, 'hex');
    if (encDekBuf.length < 28) {
      throw new Error('MALFORMED_ENVELOPE: Invalid encrypted DEK payload size.');
    }

    const kekIv = encDekBuf.subarray(0, 12);
    const wrappedDekTag = encDekBuf.subarray(12, 28);
    const wrappedDek = encDekBuf.subarray(28);

    const kekDecipher = crypto.createDecipheriv('aes-256-gcm', kekToUse, kekIv);
    kekDecipher.setAuthTag(wrappedDekTag);
    const dek = Buffer.concat([kekDecipher.update(wrappedDek), kekDecipher.final()]);

    // 2. Decrypt the ciphertext using unwrapped DEK
    const iv = Buffer.from(envelope.ivHex, 'hex');
    const authTag = Buffer.from(envelope.authTagHex, 'hex');
    const ciphertext = Buffer.from(envelope.ciphertextBase64, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', dek, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    // 3. Verify original SHA-256 digest
    const recoveredSha256 = crypto.createHash('sha256').update(plaintext).digest('hex');
    const sha256Matched = recoveredSha256.toLowerCase() === envelope.originalSha256.toLowerCase();

    if (!sha256Matched) {
      throw new Error('INTEGRITY_VIOLATION: Decrypted plaintext hash does not match original SHA-256 commitment.');
    }

    return {
      plaintext,
      mimeType: envelope.mimeType,
      sha256Matched: true,
      decryptedAt: new Date().toISOString(),
    };
  }

  public getKeyFingerprint(): string {
    return this.keyFingerprint;
  }
}
