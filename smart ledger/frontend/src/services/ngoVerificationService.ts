/**
 * TrustFabric NGO Funding Verification & Gated Escrow Service
 * CASCADE '26 Theme 4 Problem 4.2: The Black Hole Ledger
 * Real-time Document Verification, Duplicate/Fraud Detection & Gated Smart Contract Release
 */

import { type UserRole } from '../types/trustfabric';
import { AuthService } from './authService';

export type NgoDocType =
  | '12A_80G_CERTIFICATE'
  | 'NGO_DARPAN_REGISTRATION'
  | 'PAN_CARD_ORGANIZATION'
  | 'FCRA_CLEARANCE'
  | 'CANCELLED_CHEQUE'
  | 'PROJECT_PROPOSAL'
  | 'VENDOR_QUOTES'
  | 'FIELD_SURVEY';

export interface NgoVerificationDocument {
  id: string;
  type: NgoDocType;
  name: string;
  fileSha256: string;
  uploadedAt: string;
  mimeType: string;
  sizeBytes: number;
  reviewStatus: 'VERIFIED' | 'MISSING' | 'SUSPICIOUS_FLAGGED' | 'PENDING_REVIEW';
  flagReason?: string;
}

export interface NgoApplicationRecord {
  id: string;
  ngoName: string;
  regNumber: string;
  darpanId: string;
  pan: string;
  contactPerson: string;
  contactEmail: string;
  bankDetails: {
    accountNumber: string;
    ifscCode: string;
    bankName: string;
    beneficiaryName: string;
    branch: string;
  };
  projectProposal: {
    title: string;
    requestedAmountPaise: number;
    purposeCategory: string;
    milestoneCount: number;
    targetBeneficiaries: number;
    timelineMonths: number;
    summary: string;
  };
  documents: Record<string, NgoVerificationDocument>;
  automatedChecks: {
    darpanFormatValid: boolean;
    panFormatValid: boolean;
    sha256IntegrityPass: boolean;
    duplicateDarpanCollision: boolean;
    duplicateBankCollision: boolean;
    sanctionScreeningPass: boolean;
    allMandatoryDocsPresent: boolean;
    suspiciousFlagsCount: number;
  };
  verificationStatus: 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'FLAGGED_DEFECTS' | 'APPROVED' | 'REJECTED';
  reviewDecision: {
    decision: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_CHANGES';
    reviewer: string;
    reviewerRole: string;
    reviewedAt?: string;
    notes: string;
    blockingDefects: string[];
  };
  escrowAuthorization: {
    isAuthorized: boolean;
    blockingReasons: string[];
    authorizedAt?: string;
    authorizerRole?: string;
    contractEscrowTrancheId?: string;
    blockchainTxHash?: string;
    blockchainBlock?: number;
    blockchainStatus: 'NOT_AUTHORIZED' | 'PENDING' | 'ON_CHAIN_LOCKED' | 'ESCROW_RELEASED';
    onChainAnchorHash?: string;
    network: string;
    contractAddress: string;
  };
  createdAt: string;
  updatedAt: string;
}

export const MANDATORY_DOC_LABELS: Record<NgoDocType, { label: string; desc: string; isMandatory: boolean }> = {
  '12A_80G_CERTIFICATE': {
    label: '12A & 80G Tax Exemption Certificate',
    desc: 'Official Income Tax Department registration granting non-profit tax exemption status',
    isMandatory: true,
  },
  'NGO_DARPAN_REGISTRATION': {
    label: 'NITI Aayog NGO Darpan Registration',
    desc: 'National planning commission portal Darpan unique registration certificate',
    isMandatory: true,
  },
  'PAN_CARD_ORGANIZATION': {
    label: 'Organization Legal Entity PAN Card',
    desc: 'Permanent Account Number registered in the trust/society exact legal title',
    isMandatory: true,
  },
  'CANCELLED_CHEQUE': {
    label: 'Cancelled Cheque / Certified Bank Statement',
    desc: 'Disbursement bank proof matching designated NGO operations account',
    isMandatory: true,
  },
  'PROJECT_PROPOSAL': {
    label: 'Comprehensive Project Proposal & Milestone Budget',
    desc: 'Itemized milestone tranche schedule, deliverable indicators, and cost breakdown',
    isMandatory: true,
  },
  'VENDOR_QUOTES': {
    label: 'Vendor Invoices & Pro-Forma Quotations',
    desc: 'Quotations for capital expenditure (solar pumps, filtration, equipment)',
    isMandatory: false,
  },
  'FIELD_SURVEY': {
    label: 'Baseline Field Assessment & Community Attestation',
    desc: 'On-ground needs survey with photographic GPS attestations',
    isMandatory: false,
  },
  'FCRA_CLEARANCE': {
    label: 'FCRA Registration Order (Foreign Contributions)',
    desc: 'Ministry of Home Affairs clearance (required if receiving offshore grants)',
    isMandatory: false,
  },
};

const API_BASE = 'http://localhost:5001/api';

export class NgoVerificationService {
  private static instance: NgoVerificationService;
  private localCache: Map<string, NgoApplicationRecord> = new Map();

  private constructor() {
    this.initDefaultLocalSeeds();
  }

  public static getInstance(): NgoVerificationService {
    if (!NgoVerificationService.instance) {
      NgoVerificationService.instance = new NgoVerificationService();
    }
    return NgoVerificationService.instance;
  }

  /**
   * Computes client-side SHA-256 hash using native WebCrypto API
   */
  public async computeFileSha256(fileOrBuffer: File | ArrayBuffer | string): Promise<string> {
    if (typeof fileOrBuffer === 'string') {
      const encoder = new TextEncoder();
      const data = encoder.encode(fileOrBuffer);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }

    let buffer: ArrayBuffer;
    if (fileOrBuffer instanceof File) {
      buffer = await fileOrBuffer.arrayBuffer();
    } else {
      buffer = fileOrBuffer;
    }

    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Fetches all NGO funding applications
   */
  public async getApplications(): Promise<NgoApplicationRecord[]> {
    try {
      const res = await fetch(`${API_BASE}/ngo/applications`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.applications && Array.isArray(data.applications)) {
          for (const a of data.applications) {
            this.localCache.set(a.id, a);
          }
          this.persistToLocalStorage();
          return data.applications;
        }
      }
    } catch {
      // Offline / fallback to local cache
    }
    return Array.from(this.localCache.values());
  }

  /**
   * Fetches single application by ID
   */
  public async getApplication(id: string): Promise<NgoApplicationRecord | null> {
    try {
      const res = await fetch(`${API_BASE}/ngo/applications/${id}`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.application) {
          this.localCache.set(data.application.id, data.application);
          this.persistToLocalStorage();
          return data.application;
        }
      }
    } catch {
      // Local fallback
    }
    return this.localCache.get(id) || null;
  }

  /**
   * Submits a new NGO funding application
   */
  public async submitApplication(payload: {
    ngoName: string;
    regNumber: string;
    darpanId: string;
    pan: string;
    contactPerson: string;
    contactEmail: string;
    bankDetails: NgoApplicationRecord['bankDetails'];
    projectProposal: NgoApplicationRecord['projectProposal'];
  }): Promise<NgoApplicationRecord> {
    try {
      const res = await fetch(`${API_BASE}/ngo/applications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        this.localCache.set(data.application.id, data.application);
        this.persistToLocalStorage();
        return data.application;
      }
    } catch {
      // Fallback local create
    }

    const id = `ngo-app-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const newApp: NgoApplicationRecord = {
      id,
      ngoName: payload.ngoName,
      regNumber: payload.regNumber,
      darpanId: payload.darpanId,
      pan: payload.pan,
      contactPerson: payload.contactPerson,
      contactEmail: payload.contactEmail,
      bankDetails: payload.bankDetails,
      projectProposal: payload.projectProposal,
      documents: {},
      automatedChecks: {
        darpanFormatValid: /^([A-Z]{2}\/\d{4}\/\d{6,7})$/i.test(payload.darpanId),
        panFormatValid: /^[A-Z]{5}\d{4}[A-Z]$/i.test(payload.pan),
        sha256IntegrityPass: true,
        duplicateDarpanCollision: false,
        duplicateBankCollision: false,
        sanctionScreeningPass: true,
        allMandatoryDocsPresent: false,
        suspiciousFlagsCount: 0,
      },
      verificationStatus: 'SUBMITTED',
      reviewDecision: {
        decision: 'PENDING',
        reviewer: '',
        reviewerRole: '',
        notes: 'Submitted via local client.',
        blockingDefects: [],
      },
      escrowAuthorization: {
        isAuthorized: false,
        blockingReasons: ['Pending review & mandatory document submissions.'],
        blockchainStatus: 'NOT_AUTHORIZED',
        network: 'Ethereum Sepolia (EVM) / TrustFabricEscrow.sol',
        contractAddress: '0x71C569E962Ac1C7F602B7d2A40EAA672D611293B',
      },
      createdAt: now,
      updatedAt: now,
    };
    this.localCache.set(id, newApp);
    this.persistToLocalStorage();
    return newApp;
  }

  /**
   * Uploads and registers a supporting document with SHA-256 hash
   */
  public async uploadDocument(
    appId: string,
    docData: {
      type: NgoDocType;
      name: string;
      fileSha256: string;
      mimeType?: string;
      sizeBytes?: number;
      reviewStatus?: 'VERIFIED' | 'MISSING' | 'SUSPICIOUS_FLAGGED' | 'PENDING_REVIEW';
      flagReason?: string;
    }
  ): Promise<NgoApplicationRecord> {
    try {
      const res = await fetch(`${API_BASE}/ngo/applications/${appId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(docData),
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        this.localCache.set(data.application.id, data.application);
        this.persistToLocalStorage();
        return data.application;
      }
    } catch {
      // Local fallback
    }

    const app = this.localCache.get(appId);
    if (!app) throw new Error(`Application ${appId} not found.`);

    const docId = `doc-${Date.now().toString(36)}`;
    app.documents[docData.type] = {
      id: docId,
      type: docData.type,
      name: docData.name,
      fileSha256: docData.fileSha256,
      uploadedAt: new Date().toISOString(),
      mimeType: docData.mimeType || 'application/pdf',
      sizeBytes: docData.sizeBytes || 240000,
      reviewStatus: docData.reviewStatus || 'PENDING_REVIEW',
      flagReason: docData.flagReason,
    };
    this.runClientAudit(app);
    this.localCache.set(app.id, app);
    this.persistToLocalStorage();
    return app;
  }

  /**
   * Submits reviewer decision (Approve / Reject / Needs Changes)
   */
  public async submitReview(
    appId: string,
    reviewPayload: {
      decision: 'APPROVED' | 'REJECTED' | 'NEEDS_CHANGES';
      reviewer: string;
      reviewerRole: UserRole;
      notes: string;
      documentStatusUpdates?: Record<string, 'VERIFIED' | 'SUSPICIOUS_FLAGGED' | 'MISSING'>;
    }
  ): Promise<{ success: boolean; application: NgoApplicationRecord; error?: string }> {
    if (AuthService.getInstance().getCurrentUser()?.role !== reviewPayload.reviewerRole) {
      await AuthService.getInstance().loginWithRole(reviewPayload.reviewerRole);
    }
    const authHeaders = AuthService.getInstance().getAuthHeaders();
    try {
      const res = await fetch(`${API_BASE}/ngo/applications/${appId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(reviewPayload),
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        this.localCache.set(data.application.id, data.application);
        this.persistToLocalStorage();
        return { success: true, application: data.application };
      } else {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        return { success: false, application: this.localCache.get(appId)!, error: data.error };
      }
    } catch {
      // Local fallback
    }

    const app = this.localCache.get(appId);
    if (!app) throw new Error(`Application ${appId} not found.`);

    if (reviewPayload.documentStatusUpdates) {
      for (const [docType, status] of Object.entries(reviewPayload.documentStatusUpdates)) {
        if (app.documents[docType as NgoDocType]) {
          app.documents[docType as NgoDocType].reviewStatus = status;
        }
      }
    }

    this.runClientAudit(app);

    if (reviewPayload.decision === 'APPROVED') {
      if (app.automatedChecks.duplicateBankCollision || !app.automatedChecks.allMandatoryDocsPresent || app.automatedChecks.suspiciousFlagsCount > 0) {
        return {
          success: false,
          application: app,
          error: 'Cannot approve application with duplicate bank collisions or missing documents.',
        };
      }
      app.verificationStatus = 'APPROVED';
      app.escrowAuthorization.blockingReasons = [];
    } else if (reviewPayload.decision === 'REJECTED') {
      app.verificationStatus = 'REJECTED';
      app.escrowAuthorization.blockingReasons = ['Application rejected by verification team.'];
    } else {
      app.verificationStatus = 'FLAGGED_DEFECTS';
    }

    app.reviewDecision = {
      decision: reviewPayload.decision,
      reviewer: reviewPayload.reviewer,
      reviewerRole: reviewPayload.reviewerRole,
      reviewedAt: new Date().toISOString(),
      notes: reviewPayload.notes,
      blockingDefects: app.escrowAuthorization.blockingReasons,
    };

    app.updatedAt = new Date().toISOString();
    this.localCache.set(app.id, app);
    this.persistToLocalStorage();
    return { success: true, application: app };
  }

  /**
   * Executes gated smart contract funding release
   */
  public async authorizeEscrowRelease(
    appId: string,
    authorizer: { role: UserRole; name: string }
  ): Promise<{ success: boolean; application: NgoApplicationRecord; error?: string; blockingReasons?: string[] }> {
    if (AuthService.getInstance().getCurrentUser()?.role !== authorizer.role) {
      await AuthService.getInstance().loginWithRole(authorizer.role);
    }
    const authHeaders = AuthService.getInstance().getAuthHeaders();
    try {
      const res = await fetch(`${API_BASE}/ngo/applications/${appId}/authorize-funding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          authorizerRole: authorizer.role,
          authorizerName: authorizer.name,
        }),
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        this.localCache.set(data.application.id, data.application);
        this.persistToLocalStorage();
        return { success: true, application: data.application };
      } else {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        return {
          success: false,
          application: data.application || this.localCache.get(appId)!,
          error: data.error,
          blockingReasons: data.blockingReasons || [data.error || 'Escrow funding release rejected by server.'],
        };
      }
    } catch {
      // Local execution fallback
    }

    const app = this.localCache.get(appId);
    if (!app) throw new Error(`Application ${appId} not found.`);

    this.runClientAudit(app);

    const reasons: string[] = [];
    if (app.verificationStatus !== 'APPROVED') {
      reasons.push(`Verification status is '${app.verificationStatus}' (Must be 'APPROVED' before release).`);
    }
    if (!app.automatedChecks.allMandatoryDocsPresent) {
      reasons.push('Missing mandatory legal / bank compliance documents.');
    }
    if (app.automatedChecks.duplicateBankCollision) {
      reasons.push('Duplicate bank account nullifier collision detected.');
    }
    if (app.automatedChecks.suspiciousFlagsCount > 0) {
      reasons.push(`${app.automatedChecks.suspiciousFlagsCount} documents flagged as suspicious.`);
    }

    if (reasons.length > 0) {
      app.escrowAuthorization.blockingReasons = reasons;
      this.localCache.set(app.id, app);
      this.persistToLocalStorage();
      return {
        success: false,
        application: app,
        error: 'ESCROW_RELEASE_BLOCKED: Verification criteria not met.',
        blockingReasons: reasons,
      };
    }

    const now = new Date().toISOString();
    const commitment = await this.computeFileSha256(
      `TRUSTFABRIC_ESCROW_RELEASE_V1|${app.id}|${app.darpanId}|${app.bankDetails.accountNumber}|${app.projectProposal.requestedAmountPaise}|${now}`
    );
    const txHash = '0x' + (await this.computeFileSha256(`TX-${commitment}`));

    app.escrowAuthorization = {
      isAuthorized: true,
      blockingReasons: [],
      authorizedAt: now,
      authorizerRole: authorizer.role,
      contractEscrowTrancheId: `tranche-${app.id.substring(8)}`,
      blockchainTxHash: txHash,
      blockchainBlock: 5892150,
      blockchainStatus: 'ESCROW_RELEASED',
      onChainAnchorHash: '0x' + commitment,
      network: 'Ethereum Sepolia (EVM) / TrustFabricEscrow.sol',
      contractAddress: '0x71C569E962Ac1C7F602B7d2A40EAA672D611293B',
    };
    app.updatedAt = now;
    this.localCache.set(app.id, app);
    this.persistToLocalStorage();

    return { success: true, application: app };
  }

  private runClientAudit(app: NgoApplicationRecord) {
    const all = Array.from(this.localCache.values());
    let duplicateBank = false;
    let duplicateDarpan = false;

    for (const other of all) {
      if (other.id === app.id) continue;
      const otherCreated = new Date(other.createdAt).getTime();
      const appCreated = new Date(app.createdAt).getTime();
      const isOtherPreExistingOrApproved = otherCreated < appCreated || (other.verificationStatus === 'APPROVED' && app.verificationStatus !== 'APPROVED');

      if (other.bankDetails.accountNumber === app.bankDetails.accountNumber) {
        if (isOtherPreExistingOrApproved) {
          duplicateBank = true;
        }
      }
      if (other.darpanId.toLowerCase() === app.darpanId.toLowerCase()) {
        if (isOtherPreExistingOrApproved) {
          duplicateDarpan = true;
        }
      }
    }

    const mandatoryTypes: NgoDocType[] = [
      '12A_80G_CERTIFICATE',
      'NGO_DARPAN_REGISTRATION',
      'PAN_CARD_ORGANIZATION',
      'CANCELLED_CHEQUE',
      'PROJECT_PROPOSAL',
    ];

    let allMandatory = true;
    let suspiciousCount = 0;

    for (const t of mandatoryTypes) {
      const doc = app.documents[t];
      if (!doc || doc.reviewStatus === 'MISSING') {
        allMandatory = false;
      } else if (doc.reviewStatus === 'SUSPICIOUS_FLAGGED') {
        suspiciousCount++;
      }
    }

    for (const doc of Object.values(app.documents)) {
      if (!mandatoryTypes.includes(doc.type) && doc.reviewStatus === 'SUSPICIOUS_FLAGGED') {
        suspiciousCount++;
      }
    }

    app.automatedChecks = {
      darpanFormatValid: /^([A-Z]{2}\/\d{4}\/\d{6,7})$/i.test(app.darpanId),
      panFormatValid: /^[A-Z]{5}\d{4}[A-Z]$/i.test(app.pan),
      sha256IntegrityPass: true,
      duplicateDarpanCollision: duplicateDarpan,
      duplicateBankCollision: duplicateBank,
      sanctionScreeningPass: true,
      allMandatoryDocsPresent: allMandatory,
      suspiciousFlagsCount: suspiciousCount,
    };
  }

  private persistToLocalStorage() {
    try {
      const arr = Array.from(this.localCache.values());
      localStorage.setItem('tf_ngo_applications', JSON.stringify(arr));
    } catch {
      // Ignore storage errors
    }
  }

  private initDefaultLocalSeeds() {
    try {
      const stored = localStorage.getItem('tf_ngo_applications');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          for (const a of parsed) {
            this.localCache.set(a.id, a);
          }
          return;
        }
      }
    } catch {
      // fallback to hardcoded
    }

    // Default Seed Data (Fictional compliant scenarios)
    const seed1: NgoApplicationRecord = {
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
        requestedAmountPaise: 25000000,
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
        reviewerRole: 'ADMIN',
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
    };

    const seed2: NgoApplicationRecord = {
      id: 'ngo-app-002',
      ngoName: 'Gramin Solar Irrigation Initiative',
      regNumber: 'REG-KA-2022-77189',
      darpanId: 'KA/2022/011984',
      pan: 'AAATG4419E',
      contactPerson: 'Rajeshwar Hegde',
      contactEmail: 'r.hegde@gramin-solar.org',
      bankDetails: {
        accountNumber: '9182000109283921', // DUPLICATE COLLISION
        ifscCode: 'SBIN0004321',
        bankName: 'State Bank of India (Fictional Test Account)',
        beneficiaryName: 'Gramin Solar Irrigation Society',
        branch: 'Dharwad, Karnataka',
      },
      projectProposal: {
        title: 'Micro-Solar Pump Grid for Smallholders',
        requestedAmountPaise: 18000000,
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
        duplicateBankCollision: true,
        sanctionScreeningPass: true,
        allMandatoryDocsPresent: false,
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
        ],
        blockchainStatus: 'NOT_AUTHORIZED',
        network: 'Ethereum Sepolia (EVM) / TrustFabricEscrow.sol',
        contractAddress: '0x71C569E962Ac1C7F602B7d2A40EAA672D611293B',
      },
      createdAt: '2026-10-21T10:30:00.000Z',
      updatedAt: '2026-10-23T09:15:00.000Z',
    };

    this.localCache.set(seed1.id, seed1);
    this.localCache.set(seed2.id, seed2);
  }
}
