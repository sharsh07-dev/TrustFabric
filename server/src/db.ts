import crypto from 'crypto';
import type {
  DonationIntent,
  RazorpayWebhookEvent,
  PaymentVerificationEvent,
  OnchainPaymentAnchor,
  PaymentAuditEvent,
  ActiveGrant,
  NgoApplicationRecord,
  NgoVerificationDocument,
  NgoDocType,
} from './types.js';

export class PaymentDatabase {
  private static instance: PaymentDatabase;

  public donationIntents: Map<string, DonationIntent> = new Map();
  public webhookEvents: Map<string, RazorpayWebhookEvent> = new Map();
  public verificationEvents: Map<string, PaymentVerificationEvent> = new Map();
  public onchainAnchors: Map<string, OnchainPaymentAnchor> = new Map();
  public auditEvents: PaymentAuditEvent[] = [];
  public activeGrants: Map<string, ActiveGrant> = new Map();
  public ngoApplications: Map<string, NgoApplicationRecord> = new Map();

  // Secondary indices for O(1) lookups and constraint enforcement
  private orderIdIndex: Map<string, string> = new Map(); // orderId -> intentId
  private paymentIdIndex: Map<string, string> = new Map(); // paymentId -> intentId
  private idempotencyIndex: Map<string, string> = new Map(); // idempotencyKey -> intentId
  private webhookEventIndex: Map<string, string> = new Map(); // providerEventId -> eventId
  private commitmentIndex: Map<string, string> = new Map(); // paymentCommitment -> anchorId

  private constructor() {
    this.seedGrants();
    this.seedNgoApplications();
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

  // --- NGO Funding Verification Operations ---
  public insertNgoApplication(app: NgoApplicationRecord): void {
    this.ngoApplications.set(app.id, app);
    this.appendAudit({
      actorRef: 'NGO_INGRESS_PORTAL',
      action: 'NGO_APPLICATION_SUBMITTED',
      newState: app.verificationStatus,
      payload: {
        applicationId: app.id,
        ngoName: app.ngoName,
        darpanId: app.darpanId,
        requestedPaise: app.projectProposal.requestedAmountPaise,
      },
    });
  }

  public updateNgoApplication(app: NgoApplicationRecord): void {
    this.ngoApplications.set(app.id, app);
  }

  public getNgoApplication(id: string): NgoApplicationRecord | undefined {
    return this.ngoApplications.get(id);
  }

  public getAllNgoApplications(): NgoApplicationRecord[] {
    return Array.from(this.ngoApplications.values());
  }

  private seedNgoApplications(): void {
    const apps: NgoApplicationRecord[] = [
      {
        id: 'ngo-app-001',
        ngoName: 'Jal Jeevan Relief Mission',
        regNumber: 'TRUST-MH-2023-09418',
        darpanId: 'MH/2023/039182',
        pan: 'AAATJ8812F',
        contactPerson: 'Dr. Sunita Deshmukh',
        contactEmail: 's.deshmukh@jaljeevan-relief.org',
        bankDetails: {
          accountNumber: '9182000109283921',
          ifscCode: 'HDFC0001234',
          bankName: 'HDFC Bank (Fictional Test Account)',
          beneficiaryName: 'Jal Jeevan Relief Mission Trust',
          branch: 'Nariman Point, Mumbai',
        },
        projectProposal: {
          title: 'Clean Water Boreholes & Community Solar Filtration',
          requestedAmountPaise: 25000000, // ₹2,50,000
          purposeCategory: 'WATER_INFRASTRUCTURE',
          milestoneCount: 3,
          targetBeneficiaries: 1200,
          timelineMonths: 6,
          summary: 'Installation of 4 solar-powered deep aquifer borehole water filtration units across drought-prone rural clusters.',
        },
        documents: {
          '12A_80G_CERTIFICATE': {
            id: 'doc-jj-01',
            type: '12A_80G_CERTIFICATE',
            name: '12A_80G_TaxExemption_Certificate.pdf',
            fileSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            uploadedAt: '2026-10-20T10:00:00.000Z',
            mimeType: 'application/pdf',
            sizeBytes: 428019,
            reviewStatus: 'VERIFIED',
          },
          'NGO_DARPAN_REGISTRATION': {
            id: 'doc-jj-02',
            type: 'NGO_DARPAN_REGISTRATION',
            name: 'NITI_Aayog_Darpan_Reg_Certificate.pdf',
            fileSha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
            uploadedAt: '2026-10-20T10:05:00.000Z',
            mimeType: 'application/pdf',
            sizeBytes: 312480,
            reviewStatus: 'VERIFIED',
          },
          'PAN_CARD_ORGANIZATION': {
            id: 'doc-jj-03',
            type: 'PAN_CARD_ORGANIZATION',
            name: 'Legal_Entity_PAN_Card.pdf',
            fileSha256: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
            uploadedAt: '2026-10-20T10:10:00.000Z',
            mimeType: 'application/pdf',
            sizeBytes: 198200,
            reviewStatus: 'VERIFIED',
          },
          'CANCELLED_CHEQUE': {
            id: 'doc-jj-04',
            type: 'CANCELLED_CHEQUE',
            name: 'HDFC_Bank_Cancelled_Cheque_Proof.pdf',
            fileSha256: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
            uploadedAt: '2026-10-20T10:15:00.000Z',
            mimeType: 'application/pdf',
            sizeBytes: 254190,
            reviewStatus: 'VERIFIED',
          },
          'PROJECT_PROPOSAL': {
            id: 'doc-jj-05',
            type: 'PROJECT_PROPOSAL',
            name: 'Detailed_Project_Report_Milestones.pdf',
            fileSha256: 'ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d',
            uploadedAt: '2026-10-20T10:20:00.000Z',
            mimeType: 'application/pdf',
            sizeBytes: 812904,
            reviewStatus: 'VERIFIED',
          },
          'VENDOR_QUOTES': {
            id: 'doc-jj-06',
            type: 'VENDOR_QUOTES',
            name: 'Apex_Solar_Pumps_Itemized_Invoice.pdf',
            fileSha256: 'ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d',
            uploadedAt: '2026-10-20T10:25:00.000Z',
            mimeType: 'application/pdf',
            sizeBytes: 394200,
            reviewStatus: 'VERIFIED',
          },
        },
        automatedChecks: {
          darpanFormatValid: true,
          panFormatValid: true,
          sha256IntegrityPass: true,
          duplicateDarpanCollision: false,
          duplicateBankCollision: false,
          sanctionScreeningPass: true,
          allMandatoryDocsPresent: true,
          suspiciousFlagsCount: 0,
        },
        verificationStatus: 'APPROVED',
        reviewDecision: {
          decision: 'APPROVED',
          reviewer: 'Meera (NGO Verification Lead)',
          reviewerRole: 'NGO_ADMIN',
          reviewedAt: '2026-10-22T14:30:00.000Z',
          notes: 'Full KYC, 12A/80G, and bank mandate attested. Project milestones bounded to water infrastructure.',
          blockingDefects: [],
        },
        escrowAuthorization: {
          isAuthorized: false,
          blockingReasons: [],
          blockchainStatus: 'NOT_AUTHORIZED',
          network: 'Ethereum Sepolia (EVM) / TrustFabricEscrow.sol',
          contractAddress: '0x71C569E962Ac1C7F602B7d2A40EAA672D611293B',
        },
        createdAt: '2026-10-20T09:45:00.000Z',
        updatedAt: '2026-10-22T14:30:00.000Z',
      },
      {
        id: 'ngo-app-002',
        ngoName: 'Gramin Solar Irrigation Initiative',
        regNumber: 'REG-KA-2022-77189',
        darpanId: 'KA/2022/011984',
        pan: 'AAATG4419E',
        contactPerson: 'Rajeshwar Hegde',
        contactEmail: 'r.hegde@gramin-solar.org',
        bankDetails: {
          accountNumber: '9182000109283921', // DUPLICATE COLLISION with Jal Jeevan!
          ifscCode: 'SBIN0004321',
          bankName: 'State Bank of India (Fictional Test Account)',
          beneficiaryName: 'Gramin Solar Irrigation Society',
          branch: 'Dharwad, Karnataka',
        },
        projectProposal: {
          title: 'Micro-Solar Pump Grid for Smallholders',
          requestedAmountPaise: 18000000, // ₹1,80,000
          purposeCategory: 'SOLAR_ENERGY',
          milestoneCount: 2,
          targetBeneficiaries: 450,
          timelineMonths: 4,
          summary: 'Deployment of solar micro-pumps across 45 farming plots in drought belt.',
        },
        documents: {
          '12A_80G_CERTIFICATE': {
            id: 'doc-gs-01',
            type: '12A_80G_CERTIFICATE',
            name: 'Gramin_12A_Cert.pdf',
            fileSha256: '3a4b5c6d7e8f90123456789abcdef0123456789abcdef0123456789abcdef012',
            uploadedAt: '2026-10-21T11:00:00.000Z',
            mimeType: 'application/pdf',
            sizeBytes: 298100,
            reviewStatus: 'VERIFIED',
          },
          'PAN_CARD_ORGANIZATION': {
            id: 'doc-gs-02',
            type: 'PAN_CARD_ORGANIZATION',
            name: 'Gramin_PAN.pdf',
            fileSha256: '4b5c6d7e8f90123456789abcdef0123456789abcdef0123456789abcdef0123a',
            uploadedAt: '2026-10-21T11:05:00.000Z',
            mimeType: 'application/pdf',
            sizeBytes: 154300,
            reviewStatus: 'VERIFIED',
          },
          'CANCELLED_CHEQUE': {
            id: 'doc-gs-03',
            type: 'CANCELLED_CHEQUE',
            name: 'SBI_Cheque_Altered.pdf',
            fileSha256: '5c6d7e8f90123456789abcdef0123456789abcdef0123456789abcdef0123a4b',
            uploadedAt: '2026-10-21T11:10:00.000Z',
            mimeType: 'application/pdf',
            sizeBytes: 312000,
            reviewStatus: 'SUSPICIOUS_FLAGGED',
            flagReason: 'Duplicate Bank Account Number Colliding with Registered NGO (Jal Jeevan Relief Mission: 9182000109283921)',
          },
        },
        automatedChecks: {
          darpanFormatValid: true,
          panFormatValid: true,
          sha256IntegrityPass: true,
          duplicateDarpanCollision: false,
          duplicateBankCollision: true, // Collision detected!
          sanctionScreeningPass: true,
          allMandatoryDocsPresent: false, // Missing NITI Aayog Darpan Certificate & Project Proposal
          suspiciousFlagsCount: 1,
        },
        verificationStatus: 'FLAGGED_DEFECTS',
        reviewDecision: {
          decision: 'REJECTED',
          reviewer: 'Anil Verma (Senior Fraud Auditor)',
          reviewerRole: 'AUDITOR',
          reviewedAt: '2026-10-23T09:15:00.000Z',
          notes: 'REJECTED: Duplicate bank account number detected across multiple NGO applications. Missing Darpan certificate and proposal deck.',
          blockingDefects: [
            'Duplicate Bank Account: Account 9182000109283921 is already registered to Jal Jeevan Relief Mission.',
            'Missing Mandatory Document: NGO Darpan Registration Certificate.',
            'Missing Mandatory Document: Detailed Project Proposal Deck.',
          ],
        },
        escrowAuthorization: {
          isAuthorized: false,
          blockingReasons: [
            'Verification Status is REJECTED (must be APPROVED)',
            'Duplicate Bank Account collision detected across NGOs',
            'Missing 2 mandatory compliance documents',
            'Suspicious document flags must be resolved by an auditor',
          ],
          blockchainStatus: 'NOT_AUTHORIZED',
          network: 'Ethereum Sepolia (EVM) / TrustFabricEscrow.sol',
          contractAddress: '0x71C569E962Ac1C7F602B7d2A40EAA672D611293B',
        },
        createdAt: '2026-10-21T10:30:00.000Z',
        updatedAt: '2026-10-23T09:15:00.000Z',
      },
      {
        id: 'ngo-app-003',
        ngoName: 'Asha Gramin Child Health Society',
        regNumber: 'TRUST-DL-2024-55019',
        darpanId: 'DL/2024/082103',
        pan: 'AAATA9104K',
        contactPerson: 'Kavita Rao',
        contactEmail: 'k.rao@ashagramin-health.org',
        bankDetails: {
          accountNumber: '4401002938192049',
          ifscCode: 'ICIC0000441',
          bankName: 'ICICI Bank (Fictional Test Account)',
          beneficiaryName: 'Asha Gramin Child Health Society',
          branch: 'Connaught Place, New Delhi',
        },
        projectProposal: {
          title: 'Pediatric Telemedicine & Malnutrition Screening Kiosks',
          requestedAmountPaise: 35000000, // ₹3,50,000
          purposeCategory: 'HEALTHCARE',
          milestoneCount: 3,
          targetBeneficiaries: 2400,
          timelineMonths: 9,
          summary: 'Setting up 6 telemedicine consultation hubs with cold-chain nutritional supplement kits for mothers and infants.',
        },
        documents: {
          '12A_80G_CERTIFICATE': {
            id: 'doc-ag-01',
            type: '12A_80G_CERTIFICATE',
            name: 'Asha_12A_80G_Exemption_Order.pdf',
            fileSha256: '7a8b9c0d1e2f3a4b5c6d7e8f90123456789abcdef0123456789abcdef0123456',
            uploadedAt: '2026-10-24T08:00:00.000Z',
            mimeType: 'application/pdf',
            sizeBytes: 442100,
            reviewStatus: 'VERIFIED',
          },
          'NGO_DARPAN_REGISTRATION': {
            id: 'doc-ag-02',
            type: 'NGO_DARPAN_REGISTRATION',
            name: 'NITI_Darpan_AshaGramin_2024.pdf',
            fileSha256: '8b9c0d1e2f3a4b5c6d7e8f90123456789abcdef0123456789abcdef01234567a',
            uploadedAt: '2026-10-24T08:05:00.000Z',
            mimeType: 'application/pdf',
            sizeBytes: 289400,
            reviewStatus: 'VERIFIED',
          },
          'PAN_CARD_ORGANIZATION': {
            id: 'doc-ag-03',
            type: 'PAN_CARD_ORGANIZATION',
            name: 'AshaGramin_PAN_Copy.pdf',
            fileSha256: '9c0d1e2f3a4b5c6d7e8f90123456789abcdef0123456789abcdef01234567a8b',
            uploadedAt: '2026-10-24T08:10:00.000Z',
            mimeType: 'application/pdf',
            sizeBytes: 187200,
            reviewStatus: 'PENDING_REVIEW',
          },
          'CANCELLED_CHEQUE': {
            id: 'doc-ag-04',
            type: 'CANCELLED_CHEQUE',
            name: 'ICICI_Cancelled_Cheque_Leaf.pdf',
            fileSha256: '0d1e2f3a4b5c6d7e8f90123456789abcdef0123456789abcdef01234567a8b9c',
            uploadedAt: '2026-10-24T08:15:00.000Z',
            mimeType: 'application/pdf',
            sizeBytes: 320400,
            reviewStatus: 'PENDING_REVIEW',
          },
          'PROJECT_PROPOSAL': {
            id: 'doc-ag-05',
            type: 'PROJECT_PROPOSAL',
            name: 'Pediatric_Telemedicine_Full_Project_Report.pdf',
            fileSha256: '1e2f3a4b5c6d7e8f90123456789abcdef0123456789abcdef01234567a8b9c0d',
            uploadedAt: '2026-10-24T08:20:00.000Z',
            mimeType: 'application/pdf',
            sizeBytes: 940100,
            reviewStatus: 'PENDING_REVIEW',
          },
        },
        automatedChecks: {
          darpanFormatValid: true,
          panFormatValid: true,
          sha256IntegrityPass: true,
          duplicateDarpanCollision: false,
          duplicateBankCollision: false,
          sanctionScreeningPass: true,
          allMandatoryDocsPresent: true,
          suspiciousFlagsCount: 0,
        },
        verificationStatus: 'UNDER_REVIEW',
        reviewDecision: {
          decision: 'PENDING',
          reviewer: '',
          reviewerRole: '',
          notes: 'Awaiting human auditor sign-off on PAN Card and Bank Mandate.',
          blockingDefects: [],
        },
        escrowAuthorization: {
          isAuthorized: false,
          blockingReasons: ['Verification Status is UNDER_REVIEW (must be APPROVED before release)'],
          blockchainStatus: 'NOT_AUTHORIZED',
          network: 'Ethereum Sepolia (EVM) / TrustFabricEscrow.sol',
          contractAddress: '0x71C569E962Ac1C7F602B7d2A40EAA672D611293B',
        },
        createdAt: '2026-10-24T07:30:00.000Z',
        updatedAt: '2026-10-24T08:20:00.000Z',
      },
    ];

    for (const a of apps) {
      this.ngoApplications.set(a.id, a);
    }
  }
}
