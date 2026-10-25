/**
 * TrustFabric Core Domain Types
 * CASCADE '26 Theme 4 Problem 4.2: The Black Hole Ledger: Verifiable NGO Fund Flows
 * Strictly follows TRD Section 4 & Source Requirements PS42-R01 to PS42-R20
 */

export type VerificationStatus =
  | 'ON_CHAIN_VERIFIED'
  | 'SOURCE_ATTESTED'
  | 'EVIDENCE_LINKED'
  | 'RULES_CHECKED'
  | 'NEEDS_REVIEW'
  | 'SIMULATED'
  | 'UNVERIFIED';

export type EscrowState =
  | 'LOCKED'
  | 'CONDITION_PENDING'
  | 'RELEASE_ELIGIBLE'
  | 'ON_HOLD'
  | 'RELEASED'
  | 'REFUNDED';

export type FindingSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type EdgeType =
  | 'TRANSFER'
  | 'SWAP'
  | 'BRIDGE'
  | 'OFFRAMP'
  | 'PAYMENT'
  | 'ALLOCATION';

export type UserRole = 'ADMIN' | 'FINANCE_OFFICER' | 'AUDITOR' | 'DONOR';

export interface Organization {
  id: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
}

export interface Donor {
  id: string;
  displayName: string;
  accessPolicy: string[];
  contactEmailMasked: string;
}

export interface Milestone {
  id: string;
  title: string;
  description: string;
  targetDate: string;
  amountMinor: number;
  conditionType: 'DELIVERY_ATTESTATION' | 'INVOICE_EVIDENCE' | 'MULTI_SIG';
  isMet: boolean;
  metAt?: string;
  proofRef?: string;
}

export interface Grant {
  id: string;
  grantCode: string;
  donorId: string;
  organizationId: string;
  purpose: string;
  currency: string;
  authorizedAmountMinor: number;
  allowedCategories: string[];
  milestones: Milestone[];
  status: 'ACTIVE' | 'COMPLETED' | 'HALTED';
  createdAt: string;
  updatedAt: string;
  // Computed / aggregated
  allocatedMinor: number;
  spentMinor: number;
  unreconciledMinor: number;
  heldMinor: number;
  remainingMinor: number;
}

export interface Allocation {
  id: string;
  grantId: string;
  category: string;
  amountMinor: number;
  currency: string;
  milestoneId: string;
  conditionHash: string;
  status: 'APPROVED' | 'DISBURSED' | 'CANCELLED';
  contractRef?: string;
  createdAt: string;
}

export interface FinancialEvent {
  id: string;
  grantId: string;
  eventType: 'DONATION' | 'SWAP' | 'BRIDGE_LOCK' | 'BRIDGE_MINT' | 'OFFRAMP' | 'VENDOR_PAYMENT';
  sourceType: 'ETHEREUM' | 'STELLAR' | 'POLYGON' | 'BANK_FIAT' | 'SIMULATED';
  sourceChainId?: string;
  txHash: string;
  blockNumber?: number;
  blockHash?: string;
  finalityStatus: 'FINALIZED' | 'PENDING' | 'REORG_RISK';
  sourceAccountRef: string;
  destinationRef: string;
  assetId: string;
  amountMinor: number;
  currency: string;
  feeMinor: number;
  exchangeRate?: number;
  occurredAt: string;
  observedAt: string;
  provenance: string;
  simulated: boolean;
  idempotencyKey: string;
}

export interface FlowEdge {
  id: string;
  grantId: string;
  fromEventId: string;
  toEventId: string;
  edgeType: EdgeType;
  amountInMinor: number;
  assetIn: string;
  amountOutMinor: number;
  assetOut: string;
  feeMinor: number;
  rate: number;
  linkEvidenceId?: string;
  linkStatus: 'VERIFIED' | 'UNRECONCILED' | 'PARTIAL' | 'SIMULATED';
  confidenceReason: string;
}

export interface ExpenseClaim {
  id: string;
  grantId: string;
  vendorRef: string;
  invoiceNumberToken: string;
  currency: string;
  amountMinor: number;
  invoiceDate: string;
  category: string;
  purposeRef: string;
  paymentEventId?: string;
  deliveryMilestoneId?: string;
  claimStatus: 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'DISPUTED';
  disbursementStatus: EscrowState;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceDocument {
  id: string;
  claimId: string;
  filename: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  canonicalCommitment: string;
  expenseNullifierRef: string;
  extractedFields: {
    vendorName: string;
    invoiceNumber: string;
    date: string;
    totalAmountMinor: number;
    currency: string;
    lineItems?: Array<{ description: string; amountMinor: number }>;
    isOcrExtracted: boolean;
  };
  issuerSignatureRef?: string;
  verificationStatus: VerificationStatus;
  uploadedBy: string;
  uploadedAt: string;
}

export interface DuplicateMatch {
  id: string;
  claimId: string;
  matchedClaimId: string;
  matchType: 'EXACT_BYTE_DIGEST' | 'NORMALIZED_CLAIM_TUPLE' | 'EXPENSE_NULLIFIER_COLLISION';
  scoreOrRule: string;
  evidenceRefs: string[];
  status: 'ACTIVE_DISPUTE' | 'RESOLVED';
  detectedAt: string;
}

export interface DeliveryAttestation {
  id: string;
  claimId: string;
  milestoneId: string;
  canonicalStatementCommitment: string;
  signerCredentialRef: string;
  signature: string;
  nonce: string;
  issuedAt: string;
  proofRef: string;
  verificationStatus: VerificationStatus;
}

export interface VerificationFinding {
  id: string;
  grantId: string;
  claimId?: string;
  type:
    | 'UNEXPLAINED_TRANSFER'
    | 'OUT_OF_CATEGORY_SPEND'
    | 'DUPLICATE_CLAIM_DETECTED'
    | 'INVOICE_PAYMENT_MISMATCH'
    | 'MISSING_EVIDENCE'
    | 'REPORT_TOTAL_MISMATCH'
    | 'MISSING_BRIDGE_PROOF'
    | 'INVALID_DELIVERY_SIGNATURE';
  severity: FindingSeverity;
  ruleId: string;
  title: string;
  explanation: string;
  evidenceRefs: string[];
  affectedAmountMinor: number;
  findingStatus: 'OPEN' | 'INVESTIGATING' | 'DISPUTED' | 'CONFIRMED' | 'RESOLVED';
  actionTaken: string;
  detectedAt: string;
}

export interface EscrowCase {
  id: string;
  grantId: string;
  claimId: string;
  trancheId: string;
  state: EscrowState;
  triggerFindingId?: string;
  contractRef?: string;
  enforcementType: 'CONTRACT_HOLD' | 'APP_HOLD' | 'SIMULATED';
  lastTransition: string;
  transitionReason: string;
}

export interface AuditEvent {
  id: string;
  sequence: number;
  actorRef: string;
  actorRole: UserRole;
  action: string;
  entityType: string;
  entityId: string;
  timestamp: string;
  reason: string;
  beforeHash?: string;
  afterHash?: string;
  prevEventHash: string;
  eventHash: string;
  sourceRef: string;
}

export interface Report {
  id: string;
  grantId: string;
  reportPeriod: string;
  reportedTotalMinor: number;
  calculatedTotalMinor: number;
  differenceMinor: number;
  evidenceRefs: string[];
  status: 'RECONCILED' | 'DISCREPANCY_FLAGGED';
  generatedAt: string;
}

export interface BankStatementLine {
  id: string;
  transactionDate: string;
  clearingDate: string;
  bankAccountIbanOrMasked: string;
  counterpartyName: string;
  paymentReferenceToken: string;
  amountMinor: number;
  currency: string;
  feeMinor: number;
  statementDocSha256?: string;
  isSignedByBankApi: boolean;
}

// Red-Team Evaluation Types for PS42-R15
export interface RedTeamReceiptItem {
  id: string;
  invoiceNumber: string;
  vendorName: string;
  amountMinor: number;
  currency: string;
  invoiceDate: string;
  rawPayload: string;
  fileSha256: string;
  signerPublicKey: string;
  signature: string;
  nonce: string;
  // GROUND TRUTH (HIDDEN FROM DETECTOR)
  groundTruthIsForged: boolean;
  forgeryType?:
    | 'INVALID_ISSUER_SIGNATURE'
    | 'ALTERED_AMOUNT_MISMATCH'
    | 'CROSS_REPORT_DUPLICATE_REUSE'
    | 'MISMATCH_TO_PAYMENT_RECORD'
    | 'TAMPERED_INVOICE_FIELDS';
  // DETECTOR OUTPUT
  detectorResult?: {
    flaggedAsForged: boolean;
    violatedRuleId?: string;
    explanation?: string;
  };
}

export interface RedTeamMetrics {
  totalCount: number;
  groundTruthForgedCount: number;
  groundTruthLegitCount: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  specificity: number;
  f1Score: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  ruleBreakdown: Record<string, { detected: number; ruleName: string }>;
  evaluatedAt: string;
}
