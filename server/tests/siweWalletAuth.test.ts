import { describe, it, expect, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import { SiweService } from '../src/services/siweService.js';
import { verifyUserToken } from '../src/middleware/authMiddleware.js';

describe('Sign-In with Ethereum (SIWE / EIP-4361) Suite', () => {
  let siweService: SiweService;
  let donorWallet: ethers.HDNodeWallet;
  let adminWallet: ethers.HDNodeWallet;

  beforeEach(() => {
    siweService = SiweService.getInstance();
    // Deterministic test wallets
    donorWallet = ethers.Wallet.createRandom();
    adminWallet = ethers.Wallet.createRandom();
    siweService.assignWalletRole(adminWallet.address, 'ADMIN', 'Test Admin', 'org-admin-1');
  });

  it('1. Generates unpredictable challenge nonce with 5-minute expiration', () => {
    const challenge1 = siweService.generateNonce('trustfabric.org', 'https://trustfabric.org');
    const challenge2 = siweService.generateNonce('trustfabric.org', 'https://trustfabric.org');

    expect(challenge1.nonce).toBeDefined();
    expect(challenge1.nonce.length).toBe(32); // 16 bytes hex
    expect(challenge1.nonce).not.toBe(challenge2.nonce);

    const issuedAt = new Date(challenge1.issuedAt).getTime();
    const expiresAt = new Date(challenge1.expiresAt).getTime();
    expect(expiresAt - issuedAt).toBe(300 * 1000); // 5 minutes
  });

  it('2. Successfully signs and verifies standard EIP-4361 message for donor', async () => {
    const { nonce, issuedAt } = siweService.generateNonce('trustfabric.org', 'https://trustfabric.org/login');
    const domain = 'trustfabric.org';
    const uri = 'https://trustfabric.org/login';
    const chainId = 11155111; // Sepolia

    const message = [
      `${domain} wants you to sign in with your Ethereum account:`,
      donorWallet.address,
      '',
      'Sign in to TrustFabric decentralized audit portal.',
      '',
      `URI: ${uri}`,
      'Version: 1',
      `Chain ID: ${chainId}`,
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt}`,
    ].join('\n');

    const signature = await donorWallet.signMessage(message);

    const result = await siweService.verifySignature({
      message,
      signature,
      expectedDomain: 'trustfabric.org',
    });

    expect(result.valid).toBe(true);
    expect(result.address).toBe(donorWallet.address.toLowerCase());
    expect(result.user).toBeDefined();
    expect(result.user?.role).toBe('DONOR'); // Safe default: possession of wallet does not grant admin rights
    expect(result.user?.walletAddress).toBe(donorWallet.address.toLowerCase());
    expect(result.user?.authMethod).toBe('SIWE_WALLET');
    expect(result.token).toBeDefined();

    // Verify token can be validated by auth middleware
    const tokenCheck = await verifyUserToken(result.token!);
    expect(tokenCheck.valid).toBe(true);
    expect(tokenCheck.user?.walletAddress).toBe(donorWallet.address.toLowerCase());
  });

  it('3. Replay Protection: Reusing the same nonce fails', async () => {
    const { nonce, issuedAt } = siweService.generateNonce('trustfabric.org', 'https://trustfabric.org/login');
    const message = [
      `trustfabric.org wants you to sign in with your Ethereum account:`,
      donorWallet.address,
      '',
      'Sign in.',
      '',
      'URI: https://trustfabric.org/login',
      'Version: 1',
      'Chain ID: 11155111',
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt}`,
    ].join('\n');

    const signature = await donorWallet.signMessage(message);

    // First attempt succeeds
    const firstResult = await siweService.verifySignature({ message, signature });
    expect(firstResult.valid).toBe(true);

    // Second attempt using identical nonce is immediately rejected
    const secondResult = await siweService.verifySignature({ message, signature });
    expect(secondResult.valid).toBe(false);
    expect(secondResult.error).toContain('NONCE_INVALID');
  });

  it('4. Domain Binding: Rejects message signed for spoofed domain', async () => {
    const { nonce, issuedAt } = siweService.generateNonce('phishing-trustfabric.xyz');
    const message = [
      `phishing-trustfabric.xyz wants you to sign in with your Ethereum account:`,
      donorWallet.address,
      '',
      'Sign in.',
      '',
      'URI: https://phishing-trustfabric.xyz',
      'Version: 1',
      'Chain ID: 11155111',
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt}`,
    ].join('\n');

    const signature = await donorWallet.signMessage(message);

    const result = await siweService.verifySignature({
      message,
      signature,
      expectedDomain: 'trustfabric.org', // Expecting legitimate domain
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('DOMAIN_MISMATCH');
  });

  it('5. Tampered Signature: Rejects signature from different wallet', async () => {
    const { nonce, issuedAt } = siweService.generateNonce('trustfabric.org');
    const maliciousWallet = ethers.Wallet.createRandom();

    // Message says it's from donorWallet, but maliciousWallet signs it
    const message = [
      `trustfabric.org wants you to sign in with your Ethereum account:`,
      donorWallet.address,
      '',
      'Sign in.',
      '',
      'URI: https://trustfabric.org',
      'Version: 1',
      'Chain ID: 11155111',
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt}`,
    ].join('\n');

    const signature = await maliciousWallet.signMessage(message);

    const result = await siweService.verifySignature({ message, signature });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('ADDRESS_MISMATCH');
  });

  it('6. Explicit Role Segregation: Allowlisted admin wallet acquires ADMIN role', async () => {
    const { nonce, issuedAt } = siweService.generateNonce('trustfabric.org');
    const message = [
      `trustfabric.org wants you to sign in with your Ethereum account:`,
      adminWallet.address,
      '',
      'Sign in as administrator.',
      '',
      'URI: https://trustfabric.org',
      'Version: 1',
      'Chain ID: 11155111',
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt}`,
    ].join('\n');

    const signature = await adminWallet.signMessage(message);
    const result = await siweService.verifySignature({ message, signature });

    expect(result.valid).toBe(true);
    expect(result.user?.role).toBe('ADMIN');
    expect(result.user?.organizationId).toBe('org-admin-1');
  });

  it('7. Token Revocation / Logout: Revoked session tokens are rejected by middleware', async () => {
    const { nonce, issuedAt } = siweService.generateNonce('trustfabric.org');
    const message = [
      `trustfabric.org wants you to sign in with your Ethereum account:`,
      donorWallet.address,
      '',
      'Sign in.',
      '',
      'URI: https://trustfabric.org',
      'Version: 1',
      'Chain ID: 11155111',
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt}`,
    ].join('\n');

    const signature = await donorWallet.signMessage(message);
    const result = await siweService.verifySignature({ message, signature });
    const token = result.token!;

    // Initially valid
    const preCheck = await verifyUserToken(token);
    expect(preCheck.valid).toBe(true);

    // Logout / revoke
    siweService.revokeToken(token);

    // Now rejected
    const postCheck = await verifyUserToken(token);
    expect(postCheck.valid).toBe(false);
    expect(postCheck.error).toContain('revoked');
  });
});
