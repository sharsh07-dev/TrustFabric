import crypto from 'crypto';
import type {
  DonationIntent,
  RazorpayWebhookEvent,
  PaymentVerificationEvent,
  OnchainPaymentAnchor,
  PaymentAuditEvent,
  ActiveGrant,
} from './types.js';

export class PaymentDatabase {
  private static instance: PaymentDatabase;

  public donationIntents: Map<string, DonationIntent> = new Map();
  public webhookEvents: Map<string, RazorpayWebhookEvent> = new Map();
  public verificationEvents: Map<string, PaymentVerificationEvent> = new Map();
  public onchainAnchors: Map<string, OnchainPaymentAnchor> = new Map();
  public auditEvents: PaymentAuditEvent[] = [];
  public activeGrants: Map<string, ActiveGrant> = new Map();

  // Secondary indices for O(1) lookups and constraint enforcement
  private orderIdIndex: Map<string, string> = new Map(); // orderId -> intentId
  private paymentIdIndex: Map<string, string> = new Map(); // paymentId -> intentId
  private idempotencyIndex: Map<string, string> = new Map(); // idempotencyKey -> intentId
  private webhookEventIndex: Map<string, string> = new Map(); // providerEventId -> eventId
  private commitmentIndex: Map<string, string> = new Map(); // paymentCommitment -> anchorId

  private constructor() {
    this.seedGrants();
    this.initGenesisAudit();
  }

  public static getInstance(): PaymentDatabase {
    if (!PaymentDatabase.instance) {
      PaymentDatabase.instance = new PaymentDatabase();
    }
    return PaymentDatabase.instance;
  }

  private seedGrants(): void {
    const grants: ActiveGrant[] = [
      {
        id: 'grant-cw-2026-014',
        grantCode: 'CW-2026-014',
        title: 'Clean Water Boreholes & Community Solar Filtration',
        purpose: 'Deep aquifer boreholes, solar pump installations, and community water taps across drought-affected districts.',
        currency: 'INR',
        minDonationPaise: 10000, // ₹100
        maxDonationPaise: 50000000, // ₹500,000
        status: 'ACTIVE',
      },
      {
        id: 'grant-health-2026-088',
        grantCode: 'HL-2026-088',
        title: 'Rural Primary Healthcare Mobile Medical Units',
        purpose: 'Essential diagnostic medical equipment and cold-chain vaccine transports for remote clinics.',
        currency: 'INR',
        minDonationPaise: 10000,
        maxDonationPaise: 50000000,
        status: 'ACTIVE',
      },
      {
        id: 'grant-edu-2026-033',
        grantCode: 'ED-2026-033',
        title: 'Tribal School Solar STEM Learning Centers',
        purpose: 'Solar-powered digital workstations and STEM laboratory toolkits for secondary schools.',
        currency: 'INR',
        minDonationPaise: 10000,
        maxDonationPaise: 25000000,
        status: 'ACTIVE',
      },
    ];

    for (const g of grants) {
      this.activeGrants.set(g.id, g);
    }
  }

  private initGenesisAudit(): void {
    const genesisHash = crypto.createHash('sha256').update('TRUSTFABRIC_PAYMENT_GENESIS_BLOCK_2026').digest('hex');
    this.auditEvents.push({
      id: 'audit-genesis',
      sequenceNumber: 1,
      actorRef: 'SYSTEM_BOOT',
      action: 'LEDGER_INITIALIZED',
      newState: 'INITIALIZED',
      payloadHash: genesisHash,
      prevEventHash: '0'.repeat(64),
      eventHash: genesisHash,
      createdAt: new Date().toISOString(),
    });
  }

  // --- Audit Ledger Append ---
  public appendAudit(entry: {
    donationIntentId?: string;
    actorRef: string;
    action: string;
    previousState?: string;
    newState: string;
    payload: any;
  }): PaymentAuditEvent {
    const prev = this.auditEvents[this.auditEvents.length - 1];
    const prevHash = prev ? prev.eventHash : '0'.repeat(64);
    const seq = this.auditEvents.length + 1;
    const now = new Date().toISOString();

    const payloadStr = JSON.stringify(entry.payload);
    const payloadHash = crypto.createHash('sha256').update(payloadStr).digest('hex');
    const eventHash = crypto
      .createHash('sha256')
      .update(`${prevHash}:${seq}:${entry.action}:${now}:${payloadHash}`)
      .digest('hex');

    const auditRecord: PaymentAuditEvent = {
      id: `audit-${seq}`,
      sequenceNumber: seq,
      donationIntentId: entry.donationIntentId,
      actorRef: entry.actorRef,
      action: entry.action,
      previousState: entry.previousState,
      newState: entry.newState,
      payloadHash,
      prevEventHash: prevHash,
      eventHash,
      createdAt: now,
    };

    this.auditEvents.push(auditRecord);
    return auditRecord;
  }

  // --- Donation Intent Operations ---
  public insertDonationIntent(intent: DonationIntent): void {
    if (this.donationIntents.has(intent.id)) {
      throw new Error(`Duplicate donation intent ID: ${intent.id}`);
    }
    if (this.orderIdIndex.has(intent.razorpayOrderId)) {
      throw new Error(`Order ID ${intent.razorpayOrderId} is already bound to another donation intent.`);
    }
    if (this.idempotencyIndex.has(intent.idempotencyKey)) {
      throw new Error(`Idempotency key collision: ${intent.idempotencyKey}`);
    }

    this.donationIntents.set(intent.id, intent);
    this.orderIdIndex.set(intent.razorpayOrderId, intent.id);
    this.idempotencyIndex.set(intent.idempotencyKey, intent.id);

    this.appendAudit({
      donationIntentId: intent.id,
      actorRef: intent.donorId || 'DONOR_ANONYMOUS',
      action: 'DONATION_INTENT_CREATED',
      newState: intent.state,
      payload: {
        donationCode: intent.donationCode,
        grantId: intent.grantId,
        amountPaise: intent.amountPaise,
        razorpayOrderId: intent.razorpayOrderId,
      },
    });
  }

  public getDonationById(id: string): DonationIntent | undefined {
    return this.donationIntents.get(id);
  }

  public getDonationByOrderId(orderId: string): DonationIntent | undefined {
    const id = this.orderIdIndex.get(orderId);
    return id ? this.donationIntents.get(id) : undefined;
  }

  public getDonationByIdempotencyKey(key: string): DonationIntent | undefined {
    const id = this.idempotencyIndex.get(key);
    return id ? this.donationIntents.get(id) : undefined;
  }

  public updateDonationState(
    id: string,
    newState: DonationIntent['state'],
    updates: Partial<DonationIntent> = {}
  ): DonationIntent {
    const existing = this.donationIntents.get(id);
    if (!existing) {
      throw new Error(`Donation intent not found: ${id}`);
    }

    const prevState = existing.state;
    const updated: DonationIntent = {
      ...existing,
      ...updates,
      state: newState,
      updatedAt: new Date().toISOString(),
    };

    if (updates.razorpayPaymentId) {
      this.paymentIdIndex.set(updates.razorpayPaymentId, id);
    }

    this.donationIntents.set(id, updated);

    this.appendAudit({
      donationIntentId: id,
      actorRef: 'PAYMENT_ENGINE',
      action: `DONATION_STATE_${newState}`,
      previousState: prevState,
      newState: newState,
      payload: {
        donationCode: existing.donationCode,
        razorpayPaymentId: updated.razorpayPaymentId,
        updates,
      },
    });

    return updated;
  }

  // --- Webhook Event Operations ---
  public insertWebhookEvent(event: RazorpayWebhookEvent): boolean {
    if (this.webhookEventIndex.has(event.providerEventId)) {
      // Duplicate event delivery detected -> idempotent no-op
      return false;
    }

    this.webhookEvents.set(event.id, event);
    this.webhookEventIndex.set(event.providerEventId, event.id);

    this.appendAudit({
      actorRef: 'RAZORPAY_WEBHOOK_INGRESS',
      action: 'WEBHOOK_EVENT_RECORDED',
      newState: event.processingState,
      payload: {
        providerEventId: event.providerEventId,
        eventType: event.eventType,
        orderId: event.orderId,
        paymentId: event.paymentId,
      },
    });

    return true;
  }

  public isWebhookEventProcessed(providerEventId: string): boolean {
    return this.webhookEventIndex.has(providerEventId);
  }

  // --- Payment Verification Event Operations ---
  public insertVerificationEvent(ver: PaymentVerificationEvent): void {
    this.verificationEvents.set(ver.id, ver);
    this.appendAudit({
      donationIntentId: ver.donationIntentId,
      actorRef: 'VERIFICATION_ENGINE',
      action: 'PAYMENT_VERIFIED',
      newState: ver.statusAuthoritative,
      payload: {
        source: ver.verificationSource,
        signatureValid: ver.signatureValid,
        amountMatched: ver.amountMatched,
        reasonCode: ver.reasonCode,
      },
    });
  }

  // --- On-Chain Anchor Operations ---
  public insertAnchor(anchor: OnchainPaymentAnchor): void {
    if (this.commitmentIndex.has(anchor.paymentCommitment)) {
      throw new Error(`Payment commitment already anchored on-chain: ${anchor.paymentCommitment}`);
    }

    this.onchainAnchors.set(anchor.id, anchor);
    this.commitmentIndex.set(anchor.paymentCommitment, anchor.id);

    this.appendAudit({
      donationIntentId: anchor.donationIntentId,
      actorRef: anchor.relayerAddress,
      action: 'ONCHAIN_ANCHOR_RECORDED',
      newState: anchor.status,
      payload: {
        paymentCommitment: anchor.paymentCommitment,
        txHash: anchor.txHash,
        blockNumber: anchor.blockNumber,
        contractAddress: anchor.contractAddress,
        chainId: anchor.chainId,
      },
    });
  }

  public getAnchorByDonationId(donationId: string): OnchainPaymentAnchor | undefined {
    for (const a of this.onchainAnchors.values()) {
      if (a.donationIntentId === donationId) return a;
    }
    return undefined;
  }

  public getAnchorByCommitment(commitment: string): OnchainPaymentAnchor | undefined {
    const id = this.commitmentIndex.get(commitment);
    return id ? this.onchainAnchors.get(id) : undefined;
  }
}
