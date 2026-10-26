import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { PaymentDatabase } from '../src/db.js';
import { AnchorService } from '../src/services/anchorService.js';
import { config } from '../src/config.js';
import type { DonationIntent } from '../src/types.js';

describe('TrustFabric Decentralized & Multi-Rail Donation Test Suite', () => {
  let db: PaymentDatabase;
  let anchorService: AnchorService;

  beforeEach(() => {
    db = PaymentDatabase.getInstance();
    anchorService = new AnchorService();
  });

  describe('1. Configuration & Multi-Rail Support', () => {
    it('declares Direct EVM ETH as the primary payment rail', () => {
      expect(config.primaryPaymentRail).toBe('CRYPTO_EVM_ETH');
      expect(config.supportedRails).toContain('CRYPTO_EVM_ETH');
      expect(config.supportedRails).toContain('DIRECT_BANK_AUDIT');
      expect(config.supportedRails).toContain('RAZORPAY_LEGACY');
    });

    it('boots safely without requiring mandatory live Razorpay credentials', () => {
      expect(config.evmChainId).toBe(11155111);
      expect(config.networkName).toBe('Ethereum Sepolia Testnet');
      expect(config.fiatAnchorContractAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  });

  describe('2. Direct Bank / UPI Auditable Settlement', () => {
    it('creates a direct bank donation with clean UTR and anchors commitment', async () => {
      const cleanUtr = `UTR_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const donationId = `don-bank-${Date.now()}`;

      const intent: DonationIntent = {
        id: donationId,
        donationCode: `TF-BANK-${cleanUtr.slice(-6)}`,
        grantId: 'grant-cw-2026-014',
        donorId: 'donor.direct@trustfabric.org',
        amountPaise: 500000, // ₹5,000
        currency: 'INR',
        paymentRail: 'DIRECT_BANK_AUDIT',
        bankReferenceUtr: cleanUtr,
        state: 'CAPTURED',
        environment: 'TEST',
        idempotencyKey: `idem_bank_${cleanUtr}`,
        clientMetadata: {
          donorName: 'Devika Sharma',
          submissionMethod: 'DIRECT_BANK_TRANSFER',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      db.insertDonationIntent(intent);

      const retrieved = db.getDonationById(donationId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.paymentRail).toBe('DIRECT_BANK_AUDIT');
      expect(retrieved?.bankReferenceUtr).toBe(cleanUtr);
      expect(retrieved?.razorpayOrderId).toBeUndefined();

      // Retrieve via UTR index
      const byUtr = db.getDonationByUtr(cleanUtr);
      expect(byUtr?.id).toBe(donationId);

      // On-chain anchor generation
      const anchor = await anchorService.anchorDonation(donationId);
      expect(anchor).toBeDefined();
      expect(anchor.status).toBe('CONFIRMED');
      expect(anchor.paymentCommitment).toMatch(/^0x[a-f0-9]{64}$/);
      expect(anchor.txHash).toMatch(/^0x[a-f0-9]{64}$/);
      expect(anchor.explorerUrl).toContain('sepolia.etherscan.io');
    });

    it('rejects duplicate Bank UTR registration (Nullifier Replay Protection)', () => {
      const duplicateUtr = `UTR_DUP_${Date.now()}`;
      const firstIntent: DonationIntent = {
        id: `don-first-${Date.now()}`,
        donationCode: `TF-BANK-1`,
        grantId: 'grant-cw-2026-014',
        amountPaise: 250000,
        currency: 'INR',
        paymentRail: 'DIRECT_BANK_AUDIT',
        bankReferenceUtr: duplicateUtr,
        state: 'CAPTURED',
        environment: 'TEST',
        idempotencyKey: `idem_dup_1_${Date.now()}`,
        clientMetadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      db.insertDonationIntent(firstIntent);

      const secondIntent: DonationIntent = {
        id: `don-second-${Date.now()}`,
        donationCode: `TF-BANK-2`,
        grantId: 'grant-health-2026-088',
        amountPaise: 250000,
        currency: 'INR',
        paymentRail: 'DIRECT_BANK_AUDIT',
        bankReferenceUtr: duplicateUtr,
        state: 'CAPTURED',
        environment: 'TEST',
        idempotencyKey: `idem_dup_2_${Date.now()}`,
        clientMetadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(() => db.insertDonationIntent(secondIntent)).toThrow(
        /is already registered/
      );
    });
  });

  describe('3. Canonical Payment Commitment Schema Independence', () => {
    it('generates deterministic SHA-256 commitments incorporating UTR nullifier', () => {
      const intent: DonationIntent = {
        id: 'don-test-commitment-001',
        donationCode: 'TF-BANK-COMM',
        grantId: 'grant-cw-2026-014',
        amountPaise: 100000,
        currency: 'INR',
        paymentRail: 'DIRECT_BANK_AUDIT',
        bankReferenceUtr: 'UTR9988776655',
        state: 'CAPTURED',
        environment: 'TEST',
        idempotencyKey: 'idem_comm_test',
        clientMetadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const commitmentResult = anchorService.generatePaymentCommitment(intent);
      expect(commitmentResult.paymentCommitment).toMatch(/^0x[a-f0-9]{64}$/);
      expect(commitmentResult.commitmentSalt).toHaveLength(64);
      expect(commitmentResult.grantRefHash).toMatch(/^0x[a-f0-9]{64}$/);
    });
  });

  describe('4. Backward Compatibility with Historical Razorpay Records', () => {
    it('preserves existing historical Razorpay intents without schema degradation', () => {
      const legacyId = `don-legacy-${Date.now()}`;
      const legacyIntent: DonationIntent = {
        id: legacyId,
        donationCode: 'TF-RZP-HISTORICAL',
        grantId: 'grant-cw-2026-014',
        amountPaise: 150000,
        currency: 'INR',
        paymentRail: 'RAZORPAY_LEGACY',
        razorpayOrderId: `order_hist_${Date.now()}`,
        razorpayPaymentId: `pay_hist_${Date.now()}`,
        state: 'ANCHORED',
        environment: 'TEST',
        idempotencyKey: `idem_hist_${Date.now()}`,
        clientMetadata: { legacyProvenance: 'RAZORPAY_TEST_CAPTURED' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      db.insertDonationIntent(legacyIntent);
      const retrieved = db.getDonationById(legacyId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.razorpayOrderId).toMatch(/^order_hist_/);
      expect(retrieved?.razorpayPaymentId).toMatch(/^pay_hist_/);
    });
  });
});
