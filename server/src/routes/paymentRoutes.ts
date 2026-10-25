import { Router, Request, Response } from 'express';
import { config } from '../config.js';
import { PaymentDatabase } from '../db.js';
import { RazorpayService } from '../services/razorpayService.js';
import { AnchorService } from '../services/anchorService.js';

export const paymentRouter = Router();

const db = PaymentDatabase.getInstance();
const razorpayService = new RazorpayService();
const anchorService = new AnchorService();

/**
 * GET /api/config/public
 * Returns non-sensitive public configuration for the client UI
 */
paymentRouter.get('/config/public', (_req: Request, res: Response) => {
  res.json({
    razorpayKeyId: config.razorpayKeyId,
    razorpayMode: config.razorpayMode,
    isTestMode: config.razorpayMode === 'test',
    evmChainMode: config.evmChainMode,
    networkName: config.networkName,
    chainId: config.evmChainId,
    fiatAnchorContractAddress: config.fiatAnchorContractAddress,
    relayerAddress: config.relayerAddress,
    minDonationPaise: config.minDonationPaise,
    maxDonationPaise: config.maxDonationPaise,
    explorerBaseUrl: config.explorerBaseUrl,
  });
});

/**
 * GET /api/grants
 * Returns all active grants eligible for public donations
 */
paymentRouter.get('/grants', (_req: Request, res: Response) => {
  const grants = Array.from(db.activeGrants.values());
  res.json({ grants });
});

/**
 * GET /api/donations
 * Returns public feed of donations and onchain anchors from server ledger
 */
paymentRouter.get('/donations', (_req: Request, res: Response) => {
  const donations = Array.from(db.donationIntents.values()).map(intent => {
    const anchor = db.getAnchorByDonationId(intent.id);
    return {
      donationId: intent.id,
      donationCode: intent.donationCode,
      campaignId: intent.grantId,
      amountPaise: intent.amountPaise,
      currency: intent.currency,
      status: intent.state,
      provenance: intent.environment === 'TEST' ? 'RAZORPAY_TEST_CAPTURED' : 'RAZORPAY_LIVE_CAPTURED',
      razorpayPaymentId: intent.razorpayPaymentId,
      txHash: anchor?.txHash,
      blockNumber: anchor?.blockNumber,
      explorerUrl: anchor?.explorerUrl,
      createdAt: intent.createdAt,
      anchoredAt: anchor?.createdAt,
    };
  });
  res.json({ donations });
});

/**
 * POST /api/payments/razorpay/orders
 * Creates an authorized server-side Razorpay order
 */
paymentRouter.post('/payments/razorpay/orders', async (req: Request, res: Response): Promise<void> => {
  try {
    const { grantId, amountPaise, donorName, donorEmail, donorContact, idempotencyKey } = req.body;

    if (!grantId) {
      res.status(400).json({ error: 'Missing required field: grantId' });
      return;
    }
    if (!amountPaise || typeof amountPaise !== 'number') {
      res.status(400).json({ error: 'Missing or invalid amountPaise. Must be an integer number of paise.' });
      return;
    }

    const orderResult = await razorpayService.createDonationOrder({
      grantId,
      amountPaise,
      donorName,
      donorEmail,
      donorContact,
      idempotencyKey,
    });

    res.status(201).json(orderResult);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/payments/razorpay/verify
 * Validates checkout signature and confirms authoritative captured status from Razorpay
 */
paymentRouter.post('/payments/razorpay/verify', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId, paymentId, signature } = req.body;

    if (!orderId || !paymentId || !signature) {
      res.status(400).json({ error: 'Missing required fields: orderId, paymentId, signature' });
      return;
    }

    // 1. Verify payment against Razorpay API
    const verification = await razorpayService.verifyCheckoutPayment({
      orderId,
      paymentId,
      signature,
    });

    // 2. Automatically trigger on-chain anchoring if payment was verified captured
    let anchorResult = null;
    if (verification.verified && verification.donation.state === 'CAPTURED') {
      try {
        anchorResult = await anchorService.anchorDonation(verification.donation.id);
      } catch (anchorErr: any) {
        console.warn(`[AnchorWarning] Background anchor deferred: ${anchorErr.message}`);
      }
    }

    res.json({
      verified: verification.verified,
      donation: verification.donation,
      paymentDetails: verification.paymentDetails,
      anchor: anchorResult,
      notice:
        'Razorpay test payment = simulated fiat; on-chain record = cryptographic anchor. Fiat funds settle off-chain and are not stored in smart contract escrow.',
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/webhooks/razorpay
 * Durable asynchronous webhook endpoint with raw body HMAC verification
 */
paymentRouter.post('/webhooks/razorpay', async (req: Request, res: Response): Promise<void> => {
  try {
    const signatureHeader = req.headers['x-razorpay-signature'] as string;
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);

    const result = await razorpayService.handleWebhookEvent({
      rawBody,
      signatureHeader,
      event: req.body,
    });

    if (result.status === 'SIGNATURE_INVALID') {
      res.status(401).json({ error: 'Invalid webhook HMAC signature' });
      return;
    }

    res.status(200).json({ status: 'ok', result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/donations/:id/status
 * Queries authoritative status of a donation intent and its on-chain anchor
 */
paymentRouter.get('/donations/:id/status', (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const intent = db.getDonationById(id);

  if (!intent) {
    res.status(404).json({ error: 'Donation not found' });
    return Promise.resolve();
  }

  const anchor = db.getAnchorByDonationId(id);

  res.json({
    donation: intent,
    anchor: anchor || null,
    isAnchored: !!(anchor && anchor.status === 'CONFIRMED'),
  });
  return Promise.resolve();
});

/**
 * GET /api/donations/:id/proof
 * Generates an auditable cryptographic proof package for independent verification
 */
paymentRouter.get('/donations/:id/proof', (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const intent = db.getDonationById(id);

  if (!intent) {
    res.status(404).json({ error: 'Donation not found' });
    return Promise.resolve();
  }

  const anchor = db.getAnchorByDonationId(id);

  res.json({
    protocol: 'TRUSTFABRIC_FIAT_ANCHOR_V1',
    verifiedAt: new Date().toISOString(),
    donation: {
      id: intent.id,
      donationCode: intent.donationCode,
      grantId: intent.grantId,
      amountPaise: intent.amountPaise,
      amountInr: intent.amountPaise / 100,
      currency: intent.currency,
      state: intent.state,
      environment: intent.environment,
      razorpayOrderId: intent.razorpayOrderId,
      razorpayPaymentId: intent.razorpayPaymentId,
    },
    anchor: anchor
      ? {
          paymentCommitment: anchor.paymentCommitment,
          commitmentSalt: anchor.commitmentSalt,
          grantRefHash: anchor.grantRefHash,
          networkName: anchor.networkName,
          chainId: anchor.chainId,
          contractAddress: anchor.contractAddress,
          txHash: anchor.txHash,
          blockNumber: anchor.blockNumber,
          gasUsed: anchor.gasUsed,
          explorerUrl: anchor.explorerUrl,
          status: anchor.status,
        }
      : null,
    trustModelExplanation: {
      whatIsProven:
        'The backend verified Razorpay payment capture and the authorized relayer anchored the cryptographic commitment on Ethereum Sepolia.',
      whatRemainsUnproven:
        'On-chain anchor does not prove fiat banking settlement into the NGO bank account. Fiat funds settle through banking rails and are not held in smart contract escrow.',
    },
  });
  return Promise.resolve();
});

/**
 * POST /api/donations/:id/retry-anchor
 * Safely retries an anchor that failed due to RPC timeout or chain outage
 */
paymentRouter.post('/donations/:id/retry-anchor', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const anchor = await anchorService.retryAnchor(id);
    res.json({ success: true, anchor });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
