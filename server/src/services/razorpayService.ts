import crypto from 'crypto';
import { config } from '../config.js';
import { PaymentDatabase } from '../db.js';
import type { DonationIntent, PaymentVerificationEvent, RazorpayWebhookEvent } from '../types.js';

export class RazorpayService {
  private db: PaymentDatabase;

  constructor() {
    this.db = PaymentDatabase.getInstance();
  }

  private getAuthHeader(): string {
    const creds = `${config.razorpayKeyId}:${config.razorpayKeySecret}`;
    return `Basic ${Buffer.from(creds).toString('base64')}`;
  }

  /**
   * Creates a verified Razorpay order on the official Orders API.
   * Enforces server-side integer paise amounts and grant policy limits.
   */
  public async createDonationOrder(params: {
    grantId: string;
    amountPaise: number;
    donorName?: string;
    donorEmail?: string;
    donorContact?: string;
    idempotencyKey?: string;
  }): Promise<{
    donationId: string;
    donationCode: string;
    orderId: string;
    amountPaise: number;
    currency: 'INR';
    keyId: string;
    environment: 'TEST' | 'LIVE';
    grant: { id: string; title: string; purpose: string };
  }> {
    const { grantId, amountPaise, donorName, donorEmail, donorContact } = params;

    // 1. Validate Grant
    const grant = this.db.activeGrants.get(grantId);
    if (!grant || grant.status !== 'ACTIVE') {
      throw new Error(`Invalid or inactive grant: ${grantId}`);
    }

    // 2. Validate Amount (Integer Paise)
    if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
      throw new Error(`Amount must be a positive integer in minor units (paise). Received: ${amountPaise}`);
    }
    if (amountPaise < grant.minDonationPaise || amountPaise > grant.maxDonationPaise) {
      throw new Error(
        `Amount ₹${amountPaise / 100} is outside grant bounds (₹${grant.minDonationPaise / 100} - ₹${
          grant.maxDonationPaise / 100
        })`
      );
    }

    // 3. Idempotency Check
    const idempotencyKey = params.idempotencyKey || `tf_idem_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const existing = this.db.getDonationByIdempotencyKey(idempotencyKey);
    if (existing) {
      return {
        donationId: existing.id,
        donationCode: existing.donationCode,
        orderId: existing.razorpayOrderId,
        amountPaise: existing.amountPaise,
        currency: existing.currency,
        keyId: config.razorpayKeyId,
        environment: existing.environment,
        grant: { id: grant.id, title: grant.title, purpose: grant.purpose },
      };
    }

    // 4. Create Order on Razorpay API
    const receiptId = `rcpt_${Date.now().toString().slice(-8)}_${crypto.randomBytes(3).toString('hex')}`;
    const orderPayload = {
      amount: amountPaise,
      currency: 'INR',
      receipt: receiptId,
      notes: {
        platform: 'TrustFabric_CASCADE_26',
        grantId: grant.id,
        grantCode: grant.grantCode,
        donorName: donorName || 'Anonymous Donor',
        donorEmail: donorEmail || 'donor@trustfabric.org',
      },
    };

    let rzpOrder: any;
    try {
      const resp = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          Authorization: this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderPayload),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Razorpay Order API rejected request (${resp.status}): ${errText}`);
      }

      rzpOrder = await resp.json();
    } catch (err: any) {
      throw new Error(`Failed to create Razorpay order: ${err.message}`);
    }

    // 5. Store Local Donation Intent
    const donationId = `don-${crypto.randomUUID()}`;
    const donationCode = `TF-INR-${Date.now().toString().slice(-6)}`;

    const intent: DonationIntent = {
      id: donationId,
      donationCode,
      grantId: grant.id,
      donorId: donorEmail || 'anonymous',
      amountPaise,
      currency: 'INR',
      razorpayOrderId: rzpOrder.id,
      state: 'CREATED',
      environment: config.razorpayMode === 'live' ? 'LIVE' : 'TEST',
      idempotencyKey,
      clientMetadata: {
        donorName: donorName || 'Anonymous',
        donorEmail: donorEmail || '',
        donorContact: donorContact || '',
        receiptId,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.db.insertDonationIntent(intent);

    // Sync to Firebase Realtime Database
    try {
      const { ServerFirebaseService } = await import('./firebaseService.js');
      ServerFirebaseService.getInstance().syncDonationIntent({
        id: intent.id,
        donationCode: intent.donationCode,
        grantId: intent.grantId,
        amountPaise: intent.amountPaise,
        currency: intent.currency,
        razorpayOrderId: intent.razorpayOrderId,
        state: intent.state,
        environment: intent.environment,
        donorName,
        donorEmail,
        donorContact,
        createdAt: intent.createdAt,
      });
    } catch (fbErr: any) {
      console.warn(`[Firebase RTDB Notice] Async sync scheduled: ${fbErr.message}`);
    }

    return {
      donationId: intent.id,
      donationCode: intent.donationCode,
      orderId: intent.razorpayOrderId,
      amountPaise: intent.amountPaise,
      currency: intent.currency,
      keyId: config.razorpayKeyId,
      environment: intent.environment,
      grant: { id: grant.id, title: grant.title, purpose: grant.purpose },
    };
  }

  /**
   * Verifies Razorpay Checkout callback using constant-time HMAC-SHA256 signature verification
   * and queries the authoritative Razorpay Payment status to confirm 'captured' status.
   */
  public async verifyCheckoutPayment(params: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): Promise<{
    verified: boolean;
    donation: DonationIntent;
    paymentDetails: any;
  }> {
    const { orderId, paymentId, signature } = params;

    // 1. Retrieve stored intent
    const intent = this.db.getDonationByOrderId(orderId);
    if (!intent) {
      throw new Error(`No donation intent associated with Razorpay Order ID: ${orderId}`);
    }

    // 2. Cryptographic HMAC Signature Verification (Constant-Time)
    const expectedSignature = crypto
      .createHmac('sha256', config.razorpayKeySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const sigBufferA = Buffer.from(signature, 'utf8');
    const sigBufferB = Buffer.from(expectedSignature, 'utf8');

    const isSignatureValid =
      sigBufferA.length === sigBufferB.length && crypto.timingSafeEqual(sigBufferA, sigBufferB);

    if (!isSignatureValid) {
      this.db.updateDonationState(intent.id, 'FAILED');
      throw new Error('SECURITY REJECTION: Razorpay checkout HMAC signature mismatch.');
    }

    // 3. Query Authoritative Payment Status from Razorpay API
    let paymentData: any;
    try {
      const resp = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
        method: 'GET',
        headers: { Authorization: this.getAuthHeader() },
      });

      if (!resp.ok) {
        throw new Error(`Failed to query Razorpay payment ${paymentId}: ${resp.statusText}`);
      }
      paymentData = await resp.json();
    } catch (err: any) {
      throw new Error(`Authoritative payment status lookup failed: ${err.message}`);
    }

    // 4. Validate Amount, Currency, and Order Binding
    const amountMatches = paymentData.amount === intent.amountPaise;
    const currencyMatches = paymentData.currency === 'INR';
    const orderMatches = paymentData.order_id === intent.razorpayOrderId;
    const isCaptured = paymentData.status === 'captured';

    if (!amountMatches || !currencyMatches || !orderMatches) {
      this.db.updateDonationState(intent.id, 'FAILED');
      throw new Error(
        `PAYMENT INTEGRITY VIOLATION: Gateway amount/currency mismatch. Expected ₹${
          intent.amountPaise / 100
        } INR, got ₹${paymentData.amount / 100} ${paymentData.currency}`
      );
    }

    // 5. Update State Based on Authoritative Gateway Status
    let nextState: DonationIntent['state'] = 'CAPTURED';
    if (!isCaptured) {
      if (paymentData.status === 'authorized') {
        nextState = 'AUTHORIZED';
      } else {
        nextState = 'FAILED';
      }
    }

    const updated = this.db.updateDonationState(intent.id, nextState, {
      razorpayPaymentId: paymentId,
    });

    // Record formal verification event
    const verEvent: PaymentVerificationEvent = {
      id: `ver-${crypto.randomUUID()}`,
      donationIntentId: intent.id,
      verificationSource: 'CHECKOUT_CALLBACK',
      signatureValid: isSignatureValid,
      amountMatched: amountMatches,
      currencyMatched: currencyMatches,
      statusAuthoritative: paymentData.status,
      reasonCode: isCaptured ? 'PAYMENT_CAPTURED_AUTHENTICATED' : `STATUS_${paymentData.status.toUpperCase()}`,
      rawResponseDigest: crypto.createHash('sha256').update(JSON.stringify(paymentData)).digest('hex'),
      verifiedAt: new Date().toISOString(),
    };
    this.db.insertVerificationEvent(verEvent);

    if (isCaptured) {
      try {
        const { ServerFirebaseService } = await import('./firebaseService.js');
        ServerFirebaseService.getInstance().syncPaymentCaptured({
          donationId: intent.id,
          paymentId,
          orderId,
          amountPaise: intent.amountPaise,
          currency: intent.currency,
          status: 'CAPTURED',
          campaignId: intent.grantId,
        });
      } catch (fbErr: any) {
        console.warn(`[Firebase RTDB Notice] Async capture sync scheduled: ${fbErr.message}`);
      }
    }

    return {
      verified: isCaptured,
      donation: updated,
      paymentDetails: {
        paymentId: paymentData.id,
        orderId: paymentData.order_id,
        status: paymentData.status,
        method: paymentData.method,
        amount: paymentData.amount,
        currency: paymentData.currency,
        captured: isCaptured,
        email: paymentData.email,
        contact: paymentData.contact,
        createdAt: paymentData.created_at,
      },
    };
  }

  /**
   * Verifies Razorpay Webhook HMAC signature on raw request bytes
   */
  public verifyWebhookSignature(rawBody: string | Buffer, signatureHeader: string): boolean {
    if (!signatureHeader || !config.razorpayWebhookSecret) return false;

    const bodyBuffer = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
    const expectedSignature = crypto
      .createHmac('sha256', config.razorpayWebhookSecret)
      .update(bodyBuffer)
      .digest('hex');

    const bufA = Buffer.from(signatureHeader, 'utf8');
    const bufB = Buffer.from(expectedSignature, 'utf8');

    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * Processes incoming Razorpay Webhook event idempotently
   */
  public async handleWebhookEvent(params: {
    rawBody: string | Buffer;
    signatureHeader: string;
    event: any;
  }): Promise<{ status: 'PROCESSED' | 'DUPLICATE_IGNORED' | 'SIGNATURE_INVALID' | 'UNHANDLED' }> {
    const { rawBody, signatureHeader, event } = params;

    // 1. Signature Check
    const isSigValid = this.verifyWebhookSignature(rawBody, signatureHeader);
    if (!isSigValid) {
      return { status: 'SIGNATURE_INVALID' };
    }

    const eventId = event.event_id || event.id || `evt_${crypto.randomBytes(8).toString('hex')}`;
    const eventType = event.event;

    // 2. Check Idempotency
    const alreadyProcessed = this.db.isWebhookEventProcessed(eventId);
    if (alreadyProcessed) {
      return { status: 'DUPLICATE_IGNORED' };
    }

    const orderId = event.payload?.payment?.entity?.order_id || event.payload?.order?.entity?.id;
    const paymentId = event.payload?.payment?.entity?.id;

    const webhookRecord: RazorpayWebhookEvent = {
      id: `wh-${crypto.randomUUID()}`,
      providerEventId: eventId,
      eventType,
      orderId,
      paymentId,
      signatureVerified: true,
      processingState: 'PROCESSED',
      payloadSafeMetadata: {
        eventType,
        orderId,
        paymentId,
        amount: event.payload?.payment?.entity?.amount,
        status: event.payload?.payment?.entity?.status,
      },
      receivedAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
    };

    this.db.insertWebhookEvent(webhookRecord);

    // 3. Process Event Types
    if (orderId) {
      const intent = this.db.getDonationByOrderId(orderId);
      if (intent) {
        if (eventType === 'payment.captured') {
          this.db.updateDonationState(intent.id, 'CAPTURED', {
            razorpayPaymentId: paymentId,
          });
        } else if (eventType === 'payment.failed') {
          this.db.updateDonationState(intent.id, 'FAILED');
        } else if (eventType === 'refund.processed' || eventType === 'refund.created') {
          this.db.updateDonationState(intent.id, 'REFUNDED');
        }
      }
    }

    return { status: 'PROCESSED' };
  }
}
