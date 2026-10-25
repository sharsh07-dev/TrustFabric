/**
 * @file types.ts
 * Shared type definitions for the AidFlow SDK.
 *
 * These types mirror the Soroban contract data structures.
 */

// ─── Configuration ────────────────────────────────────────────────────────────

/** Contract addresses for all deployed AidFlow modules */
export interface AidFlowContracts {
  fundPool: string;
  distribution: string;
  registry: string;
  milestoneEngine: string;
  audit: string;
}

/** SDK configuration */
export interface AidFlowConfig {
  /** Stellar network passphrase */
  networkPassphrase: string;
  /** Soroban RPC endpoint URL */
  rpcUrl: string;
  /** Deployed contract addresses */
  contracts: AidFlowContracts;
}

// ─── FundPool Types ───────────────────────────────────────────────────────────

export interface DonateParams {
  /** Donor's Stellar address */
  donor: string;
  /** Amount in token base units (e.g., stroops) */
  amount: bigint;
}

export interface DonationRecord {
  donor: string;
  amount: bigint;
  /** Ledger sequence at time of donation */
  ledger: number;
}

// ─── Beneficiary Registry Types ───────────────────────────────────────────────

export interface BeneficiaryMetadata {
  name: string;
  region: string;
  category: string;
}

export interface RegisterBeneficiaryParams {
  address: string;
  metadata: BeneficiaryMetadata;
}

export interface BeneficiaryRecord {
  address: string;
  metadata: BeneficiaryMetadata;
  isVerified: boolean;
  isActive: boolean;
  registeredAt: number;
}

// ─── Distribution Types ───────────────────────────────────────────────────────

export enum AllocationStatus {
  Pending = 0,
  Released = 1,
  Cancelled = 2,
}

export interface AllocateFundsParams {
  beneficiary: string;
  amount: bigint;
  /** Set to 0 for no milestone condition */
  milestoneId?: number;
}

export interface Allocation {
  beneficiary: string;
  amount: bigint;
  status: AllocationStatus;
  allocatedAt: number;
  releasedAt: number;
  milestoneId: number;
}

// ─── Milestone Engine Types ───────────────────────────────────────────────────

export enum ConditionType {
  ManualApproval = 0,
  TimeUnlock = 1,
  // TODO(contributor): Add new condition types here as the engine is extended
}

export interface MilestoneCondition {
  conditionType: ConditionType;
  /** For TimeUnlock: the target ledger sequence number. For ManualApproval: 0 */
  data: number;
}

export interface CreateMilestoneParams {
  beneficiary: string;
  condition: MilestoneCondition;
}

export interface Milestone {
  beneficiary: string;
  condition: MilestoneCondition;
  isMet: boolean;
  createdAt: number;
  metAt: number;
}

// ─── Audit Types ──────────────────────────────────────────────────────────────

export enum AuditEventType {
  Donation = 0,
  Allocation = 1,
  Release = 2,
  BeneficiaryRegistered = 3,
  BeneficiaryVerified = 4,
  MilestoneApproved = 5,
  AllocationCancelled = 6,
}

export interface AuditEvent {
  eventId: number;
  eventType: AuditEventType;
  actor: string;
  subject: string;
  amount: bigint;
  ledger: number;
  refId: number;
}

// ─── Transaction Types ─────────────────────────────────────────────────────────

export interface TransactionResult {
  /** Transaction hash */
  hash: string;
  /** Whether the transaction was successful */
  success: boolean;
  /** Return value from the contract call */
  value?: unknown;
}
