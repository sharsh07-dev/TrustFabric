import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { PaymentDatabase } from '../src/db.js';
import { RazorpayService } from '../src/services/razorpayService.js';
import { AnchorService } from '../src/services/anchorService.js';
import { config } from '../src/config.js';

describe('TrustFabric Razorpay & Blockchain Anchor Test Suite (PS 4.2)', () => {
  let db: PaymentDatabase;
  let razorpayService: RazorpayService;
  let anchorService: AnchorService;

  beforeEach(() => {
    db = PaymentDatabase.getInstance();
    razorpayService = new RazorpayService();
    anchorService = new AnchorService();
  });

  describe('1. Razorpay Order Creation & Validation', () => {
    it('creates an order with server-validated integer paise amount on active grant', async () => {
      const order = await razorpayService.createDonationOrder({
        grantId: 'grant-cw-2026-014',
        amountPaise: 250000, // ₹2,500
        donorName: 'Test Donor A',
        donorEmail: 'donor.a@trustfabric.org',
      });

      expect(order.orderId).toMatch(/^order_/);
      expect(order.amountPaise).toBe(250000);
      expect(order.currency).toBe('INR');
      expect(order.keyId).toBe(config.razorpayKeyId);
      expect(order.environment).toBe('TEST');

      const intent = db.getDonationById(order.donationId);
      expect(intent).toBeDefined();
      expect(intent?.state).toBe('CREATED');
    });

    it('rejects invalid or non-existent grant ID', async () => {
      await expect(
        razorpayService.createDonationOrder({
          grantId: 'grant-non-existent-999',
          amountPaise: 50000,
        })
      ).rejects.toThrow('Invalid or inactive grant');
    });

    it('rejects fractional or non-integer paise amount', async () => {
      await expect(
        razorpayService.createDonationOrder({
          grantId: 'grant-cw-2026-014',
          amountPaise: 250.75 as any,
        })
      ).rejects.toThrow('Amount must be a positive integer in minor units');
    });

    it('rejects amount exceeding grant ceiling or below minimum', async () => {
      // Below min (min is ₹100 = 10000 paise)
      await expect(
        razorpayService.createDonationOrder({
          grantId: 'grant-cw-2026-014',
          amountPaise: 5000, // ₹50
        })
      ).rejects.toThrow('outside grant bounds');

      // Above max (max is ₹500,000 = 50,000,000 paise)
      await expect(
        razorpayService.createDonationOrder({
          grantId: 'grant-cw-2026-014',
          amountPaise: 60000000,
        })
      ).rejects.toThrow('outside grant bounds');
    });

    it('idempotently returns existing order when identical idempotencyKey is supplied', async () => {
      const key = `idem_${Date.now()}_test_001`;
      const first = await razorpayService.createDonationOrder({
        grantId: 'grant-cw-2026-014',
        amountPaise: 100000, // ₹1,000
        idempotencyKey: key,
      });

      const second = await razorpayService.createDonationOrder({
        grantId: 'grant-cw-2026-014',
        amountPaise: 100000,
        idempotencyKey: key,
      });

      expect(second.donationId).toBe(first.donationId);
      expect(second.orderId).toBe(first.orderId);
    });
  });

  describe('2. Checkout Signature & Payment Verification', () => {
    it('accepts valid HMAC-SHA256 signature and rejects forged signature', async () => {
      const order = await razorpayService.createDonationOrder({
        grantId: 'grant-cw-2026-014',
        amountPaise: 150000, // ₹1,500
      });

      const fakePaymentId = `pay_${Date.now().toString().slice(-8)}_${crypto.randomBytes(3).toString('hex')}`;

      // Correct signature
      const validSig = crypto
        .createHmac('sha256', config.razorpayKeySecret)
        .update(`${order.orderId}|${fakePaymentId}`)
        .digest('hex');

      // Forged signature
      const forgedSig = crypto.randomBytes(32).toString('hex');

      // Forged signature must throw
      await expect(
        razorpayService.verifyCheckoutPayment({
          orderId: order.orderId,
          paymentId: fakePaymentId,
          signature: forgedSig,
        })
      ).rejects.toThrow('SECURITY REJECTION: Razorpay checkout HMAC signature mismatch');
    });

    it('rejects verification if order ID is unknown', async () => {
      await expect(
        razorpayService.verifyCheckoutPayment({
          orderId: 'order_UNKNOWN_999999',
          paymentId: 'pay_123456',
          signature: 'abcd',
        })
      ).rejects.toThrow('No donation intent associated with Razorpay Order ID');
    });
  });

  describe('3. Webhook Ingestion & Idempotency', () => {
    it('verifies valid webhook HMAC signature and rejects invalid webhook signature', async () => {
      const payload = {
        event_id: `evt_test_${Date.now()}`,
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_test_wh_001',
              amount: 100000,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      };

      const rawBody = JSON.stringify(payload);
      const validSignature = crypto
        .createHmac('sha256', config.razorpayWebhookSecret)
        .update(rawBody)
        .digest('hex');

      const isValid = razorpayService.verifyWebhookSignature(rawBody, validSignature);
      expect(isValid).toBe(true);

      const isInvalid = razorpayService.verifyWebhookSignature(rawBody, 'tampered_signature_hex');
      expect(isInvalid).toBe(false);
    });

    it('processes webhook event once and returns DUPLICATE_IGNORED on retries', async () => {
      const eventId = `evt_idempotent_${Date.now()}`;
      const payload = {
        id: eventId,
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: `pay_idem_${Date.now()}`,
              amount: 100000,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      };

      const rawBody = JSON.stringify(payload);
      const signature = crypto
        .createHmac('sha256', config.razorpayWebhookSecret)
        .update(rawBody)
        .digest('hex');

      // First delivery -> PROCESSED
      const first = await razorpayService.handleWebhookEvent({
        rawBody,
        signatureHeader: signature,
        event: payload,
      });
      expect(first.status).toBe('PROCESSED');

      // Duplicate delivery -> DUPLICATE_IGNORED
      const retry = await razorpayService.handleWebhookEvent({
        rawBody,
        signatureHeader: signature,
        event: payload,
      });
      expect(retry.status).toBe('DUPLICATE_IGNORED');
    });

    it('records refund event as linked compensating state REFUNDED', async () => {
      const order = await razorpayService.createDonationOrder({
        grantId: 'grant-cw-2026-014',
        amountPaise: 100000,
      });

      // Simulate capture
      db.updateDonationState(order.donationId, 'CAPTURED', {
        razorpayPaymentId: 'pay_for_refund_001',
      });

      // Deliver refund webhook
      const refundEvent = {
        id: `evt_ref_${Date.now()}`,
        event: 'refund.processed',
        payload: {
          payment: {
            entity: {
              id: 'pay_for_refund_001',
              order_id: order.orderId,
            },
          },
        },
      };

      const rawBody = JSON.stringify(refundEvent);
      const signature = crypto
        .createHmac('sha256', config.razorpayWebhookSecret)
        .update(rawBody)
        .digest('hex');

      await razorpayService.handleWebhookEvent({
        rawBody,
        signatureHeader: signature,
        event: refundEvent,
      });

      const updated = db.getDonationById(order.donationId);
      expect(updated?.state).toBe('REFUNDED');
    });
  });

  describe('4. Blockchain Anchoring & Commitment Tests', () => {
    it('creates canonical cryptographic commitment and anchors confirmed payment', async () => {
      const order = await razorpayService.createDonationOrder({
        grantId: 'grant-cw-2026-014',
        amountPaise: 500000, // ₹5,000
      });

      // Transition to captured
      db.updateDonationState(order.donationId, 'CAPTURED', {
        razorpayPaymentId: `pay_anchor_test_${Date.now()}`,
      });

      const anchor = await anchorService.anchorDonation(order.donationId);

      expect(anchor.status).toBe('CONFIRMED');
      expect(anchor.receiptStatus).toBe('SUCCESS');
      expect(anchor.paymentCommitment).toMatch(/^0x[a-f0-9]{64}$/);
      expect(anchor.txHash).toMatch(/^0x[a-f0-9]{64}$/);
      expect(anchor.blockNumber).toBeGreaterThan(7000000);
      expect(anchor.explorerUrl).toContain('https://sepolia.etherscan.io/tx/0x');
      expect(anchor.chainId).toBe(11155111);

      const intent = db.getDonationById(order.donationId);
      expect(intent?.state).toBe('ANCHORED');
    });

    it('rejects anchoring an unverified or failed donation', async () => {
      const order = await razorpayService.createDonationOrder({
        grantId: 'grant-cw-2026-014',
        amountPaise: 100000,
      });

      // Still in CREATED state -> should throw
      await expect(anchorService.anchorDonation(order.donationId)).rejects.toThrow(
        "Cannot anchor donation in state 'CREATED'"
      );
    });

    it('idempotently returns existing anchor when retryAnchor is called on an already anchored payment', async () => {
      const order = await razorpayService.createDonationOrder({
        grantId: 'grant-cw-2026-014',
        amountPaise: 200000,
      });

      db.updateDonationState(order.donationId, 'CAPTURED', {
        razorpayPaymentId: `pay_idem_anc_${Date.now()}`,
      });

      const firstAnchor = await anchorService.anchorDonation(order.donationId);
      const secondAnchor = await anchorService.retryAnchor(order.donationId);

      expect(secondAnchor.paymentCommitment).toBe(firstAnchor.paymentCommitment);
      expect(secondAnchor.txHash).toBe(firstAnchor.txHash);
    });
  });

  describe('5. Audit Hash Chain Integrity', () => {
    it('maintains continuous SHA-256 sequential audit chain for all payment events', () => {
      const events = db.auditEvents;
      expect(events.length).toBeGreaterThan(5);

      for (let i = 1; i < events.length; i++) {
        const prev = events[i - 1];
        const curr = events[i];

        expect(curr.prevEventHash).toBe(prev.eventHash);
        expect(curr.sequenceNumber).toBe(prev.sequenceNumber + 1);

        // Verify hash computation
        const expectedHash = crypto
          .createHash('sha256')
          .update(`${curr.prevEventHash}:${curr.sequenceNumber}:${curr.action}:${curr.createdAt}:${curr.payloadHash}`)
          .digest('hex');

        expect(curr.eventHash).toBe(expectedHash);
      }
    });
  });
});
