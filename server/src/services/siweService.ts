import crypto from 'crypto';
import { ethers } from 'ethers';
import { JwtService } from './jwtService.js';
import { DbPersistenceService } from './dbPersistenceService.js';
import type { AuthUser, UserRole } from '../types.js';

export interface SiweNonceRecord {
  nonce: string;
  issuedAt: number; // Unix timestamp in seconds
  expiresAt: number; // Unix timestamp in seconds
  domain?: string;
  uri?: string;
}

export interface ParsedSiweMessage {
  domain: string;
  address: string;
  statement?: string;
  uri: string;
  version: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
  notBefore?: string;
}

export interface SiweVerificationResult {
  valid: boolean;
  address?: string;
  user?: AuthUser;
  token?: string;
  error?: string;
}

export class SiweService {
  private static instance: SiweService;
  private jwtService: JwtService;
  private dbPersistence: DbPersistenceService;

  // Active challenge nonces stored with 5-minute TTL
  private activeNonces: Map<string, SiweNonceRecord> = new Map();

  // Explicit wallet role registry for decentralized RBAC
  // (Possession of wallet != real-world organization identity; verified roles must be explicit)
  private walletRoles: Map<string, { role: UserRole; name: string; orgId?: string }> = new Map();

  // Invalidated tokens (blacklist for explicit logout)
  private revokedTokens: Set<string> = new Set();

  private readonly NONCE_TTL_SECONDS = 300; // 5 minutes

  private constructor() {
    this.jwtService = JwtService.getInstance();
    this.dbPersistence = DbPersistenceService.getInstance();
    this.seedDefaultPrivilegedWallets();
  }

  public static getInstance(): SiweService {
    if (!SiweService.instance) {
      SiweService.instance = new SiweService();
    }
    return SiweService.instance;
  }

  /**
   * Seed known development/auditor wallets for testing role segregation.
   * In production, roles are assigned via on-chain multisig governance or administrative allowlists.
   */
  private seedDefaultPrivilegedWallets(): void {
    // Lead Relayer & Admin
    this.walletRoles.set('0x90F79bf6EB2c4f870365E785982E1f101E93b906'.toLowerCase(), {
      role: 'ADMIN',
      name: 'Sepolia Relayer / System Admin',
      orgId: 'trustfabric-foundation',
    });
    // Independent Forensic Auditor
    this.walletRoles.set('0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65'.toLowerCase(), {
      role: 'AUDITOR',
      name: 'Lead Cryptographic Auditor',
      orgId: 'org-independent-audit',
    });
  }

  /**
   * Generate unpredictable, server-stored nonce with 5-minute expiration
   */
  public generateNonce(domain?: string, uri?: string): { nonce: string; expiresAt: string; issuedAt: string } {
    this.cleanupExpiredNonces();

    // 16 cryptographically random bytes = 32 hex chars
    const nonce = crypto.randomBytes(16).toString('hex');
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresSec = nowSec + this.NONCE_TTL_SECONDS;

    this.activeNonces.set(nonce, {
      nonce,
      issuedAt: nowSec,
      expiresAt: expiresSec,
      domain,
      uri,
    });

    return {
      nonce,
      issuedAt: new Date(nowSec * 1000).toISOString(),
      expiresAt: new Date(expiresSec * 1000).toISOString(),
    };
  }

  /**
   * Parse EIP-4361 compliant message format
   */
  public parseSiweMessage(message: string): ParsedSiweMessage {
    const lines = message.split('\n');
    if (lines.length < 5) {
      throw new Error('MALFORMED_SIWE_MESSAGE: Insufficient lines for standard EIP-4361 format.');
    }

    // Line 0: "${domain} wants you to sign in with your Ethereum account:"
    const headerMatch = lines[0].match(/^(.+) wants you to sign in with your Ethereum account:$/);
    if (!headerMatch) {
      throw new Error('MALFORMED_SIWE_MESSAGE: Invalid header statement format.');
    }
    const domain = headerMatch[1].trim();

    // Line 1: Address
    const address = lines[1].trim();
    if (!ethers.isAddress(address)) {
      throw new Error(`MALFORMED_SIWE_MESSAGE: Invalid Ethereum address '${address}'.`);
    }

    let uri = '';
    let version = '1';
    let chainId = 1;
    let nonce = '';
    let issuedAt = '';
    let expirationTime: string | undefined;
    let notBefore: string | undefined;
    const statementLines: string[] = [];

    // Parse subsequent key-value pairs
    let isParsingStatement = true;
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('URI: ')) {
        isParsingStatement = false;
        uri = line.substring(5).trim();
      } else if (line.startsWith('Version: ')) {
        isParsingStatement = false;
        version = line.substring(9).trim();
      } else if (line.startsWith('Chain ID: ')) {
        isParsingStatement = false;
        chainId = parseInt(line.substring(10).trim(), 10);
      } else if (line.startsWith('Nonce: ')) {
        isParsingStatement = false;
        nonce = line.substring(7).trim();
      } else if (line.startsWith('Issued At: ')) {
        isParsingStatement = false;
        issuedAt = line.substring(11).trim();
      } else if (line.startsWith('Expiration Time: ')) {
        isParsingStatement = false;
        expirationTime = line.substring(17).trim();
      } else if (line.startsWith('Not Before: ')) {
        isParsingStatement = false;
        notBefore = line.substring(12).trim();
      } else if (isParsingStatement && line.length > 0) {
        statementLines.push(line);
      }
    }

    if (!uri || !nonce || !issuedAt) {
      throw new Error('MALFORMED_SIWE_MESSAGE: Missing mandatory URI, Nonce, or Issued At fields.');
    }

    return {
      domain,
      address,
      statement: statementLines.join('\n') || undefined,
      uri,
      version,
      chainId,
      nonce,
      issuedAt,
      expirationTime,
      notBefore,
    };
  }

  /**
   * Cryptographically verify SIWE message signature and enforce anti-replay guarantees
   */
  public async verifySignature(params: {
    message: string;
    signature: string;
    expectedDomain?: string;
  }): Promise<SiweVerificationResult> {
    const { message, signature, expectedDomain } = params;

    try {
      // 1. Parse and validate structure
      const parsed = this.parseSiweMessage(message);

      // 2. Validate domain binding if expected
      if (expectedDomain && parsed.domain.toLowerCase() !== expectedDomain.toLowerCase()) {
        return {
          valid: false,
          error: `DOMAIN_MISMATCH: Message domain '${parsed.domain}' does not match expected '${expectedDomain}'.`,
        };
      }

      // 3. Verify Nonce existence and consume immediately (anti-replay)
      const nonceRecord = this.activeNonces.get(parsed.nonce);
      if (!nonceRecord) {
        return {
          valid: false,
          error: 'NONCE_INVALID: The provided nonce is unknown, already consumed, or expired.',
        };
      }

      // Consume nonce immediately
      this.activeNonces.delete(parsed.nonce);

      // 4. Verify Nonce expiration
      const nowSec = Math.floor(Date.now() / 1000);
      if (nonceRecord.expiresAt < nowSec) {
        return {
          valid: false,
          error: 'NONCE_EXPIRED: The authentication challenge has expired. Request a new nonce.',
        };
      }

      // 5. Verify message expiration time if specified
      if (parsed.expirationTime) {
        const expTimeSec = Math.floor(new Date(parsed.expirationTime).getTime() / 1000);
        if (expTimeSec < nowSec) {
          return {
            valid: false,
            error: 'MESSAGE_EXPIRED: SIWE message expiration time has passed.',
          };
        }
      }

      // 6. Cryptographic signature recovery via ethers.verifyMessage
      let recoveredAddress: string;
      try {
        recoveredAddress = ethers.verifyMessage(message, signature);
      } catch (err: any) {
        return {
          valid: false,
          error: `SIGNATURE_INVALID: Cryptographic verification failed: ${err.message}`,
        };
      }

      if (recoveredAddress.toLowerCase() !== parsed.address.toLowerCase()) {
        return {
          valid: false,
          error: `ADDRESS_MISMATCH: Signer '${recoveredAddress}' does not match declared address '${parsed.address}'.`,
        };
      }

      // 7. Resolve authorization role
      // Critical security rule: A wallet signature proves control of a key, not real-world identity.
      // Default to 'DONOR'. Only explicit allowlisted addresses receive elevated privileges.
      const normalizedAddress = recoveredAddress.toLowerCase();
      const roleConfig = this.walletRoles.get(normalizedAddress);
      const role: UserRole = roleConfig ? roleConfig.role : 'DONOR';
      const name: string = roleConfig
        ? roleConfig.name
        : `Donor (${normalizedAddress.slice(0, 6)}...${normalizedAddress.slice(-4)})`;
      const organizationId: string | undefined = roleConfig?.orgId;

      const user: AuthUser = {
        id: `usr-wallet-${normalizedAddress.slice(2, 10)}`,
        walletAddress: normalizedAddress,
        authMethod: 'SIWE_WALLET',
        name,
        email: `${normalizedAddress}@wallet.trustfabric.org`,
        role,
        organizationId,
      };

      // 8. Sign standard JWT session
      const token = this.jwtService.signToken(user, 86400); // 24hr session

      return {
        valid: true,
        address: normalizedAddress,
        user,
        token,
      };
    } catch (err: any) {
      return {
        valid: false,
        error: err.message || 'SIWE verification failed.',
      };
    }
  }

  /**
   * Explicitly assign or update a wallet's authorized role (e.g. from contract governance)
   */
  public assignWalletRole(address: string, role: UserRole, name?: string, orgId?: string): void {
    if (!ethers.isAddress(address)) {
      throw new Error(`Invalid address '${address}'.`);
    }
    const normalized = address.toLowerCase();
    this.walletRoles.set(normalized, {
      role,
      name: name || `${role} (${normalized.slice(0, 6)}...${normalized.slice(-4)})`,
      orgId,
    });
  }

  /**
   * Invalidate an active session token
   */
  public revokeToken(token: string): void {
    this.revokedTokens.add(token);
  }

  /**
   * Check if token was explicitly revoked
   */
  public isTokenRevoked(token: string): boolean {
    return this.revokedTokens.has(token);
  }

  public getActiveNonceCount(): number {
    this.cleanupExpiredNonces();
    return this.activeNonces.size;
  }

  private cleanupExpiredNonces(): void {
    const now = Math.floor(Date.now() / 1000);
    for (const [nonce, record] of this.activeNonces.entries()) {
      if (record.expiresAt < now) {
        this.activeNonces.delete(nonce);
      }
    }
  }
}
