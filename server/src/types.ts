export type DonationState =
  | 'CREATED'
  | 'CHECKOUT_OPEN'
  | 'AUTHORIZED'
  | 'CAPTURED'
  | 'CAPTURED_ANCHOR_PENDING'
  | 'ANCHORED'
  | 'ANCHOR_FAILED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export type EnvironmentMode = 'TEST' | 'LIVE';

export interface DonationIntent {
  id: string;
  donationCode: string;
  grantId: string;
  donorId?: string;
  amountPaise: number; // integer paise
  currency: 'INR';
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  state: DonationState;
  environment: EnvironmentMode;
  idempotencyKey: string;
  clientMetadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface RazorpayWebhookEvent {
  id: string;
  providerEventId: string;
  eventType: string;
  orderId?: string;
  paymentId?: string;
  signatureVerified: boolean;
  processingState: 'RECEIVED' | 'PROCESSED' | 'DUPLICATE_IGNORED' | 'FAILED';
  payloadSafeMetadata: Record<string, any>;
  receivedAt: string;
  processedAt?: string;
}

export interface PaymentVerificationEvent {
  id: string;
  donationIntentId: string;
  verificationSource: 'CHECKOUT_CALLBACK' | 'RAZORPAY_API_POLL' | 'WEBHOOK';
  signatureValid: boolean;
  amountMatched: boolean;
  currencyMatched: boolean;
  statusAuthoritative: string;
  reasonCode: string;
  rawResponseDigest: string;
  verifiedAt: string;
}

export interface OnchainPaymentAnchor {
  id: string;
  donationIntentId: string;
  paymentCommitment: string;
  commitmentSalt: string;
  grantRefHash: string;
  chainId: number;
  networkName: string;
  contractAddress: string;
  relayerAddress: string;
  txHash: string;
  blockNumber: number;
  gasUsed: number;
  receiptStatus: 'SUCCESS' | 'REVERTED' | 'PENDING';
  status: 'PENDING' | 'SUBMITTED' | 'CONFIRMED' | 'REVERTED' | 'RETRY_PENDING';
  retryCount: number;
  explorerUrl: string;
  createdAt: string;
  confirmedAt?: string;
}

export interface PaymentAuditEvent {
  id: string;
  sequenceNumber: number;
  donationIntentId?: string;
  actorRef: string;
  action: string;
  previousState?: string;
  newState: string;
  payloadHash: string;
  prevEventHash: string;
  eventHash: string;
  createdAt: string;
}

export interface ActiveGrant {
  id: string;
  grantCode: string;
  title: string;
  purpose: string;
  currency: 'INR';
  minDonationPaise: number;
  maxDonationPaise: number;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
}

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

export type UserRole = 'ADMIN' | 'FINANCE_OFFICER' | 'AUDITOR' | 'DONOR' | 'FIELD_WORKER';

export interface AuthUser {
  id: string;
  clerkUserId?: string;
  name: string;
  email: string;
  role: UserRole;
  organizationId?: string;
  iat?: number;
  exp?: number;
}
