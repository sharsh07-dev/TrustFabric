/**
 * @file protocolState.ts
 * AidFlow Protocol State Management and Soroban Contract Simulator
 *
 * Implements the state machine and ledger logic for:
 * 1. FundPool Contract (contracts/fund_pool)
 * 2. BeneficiaryRegistry Contract (contracts/beneficiary_registry)
 * 3. MilestoneEngine Contract (contracts/milestone_engine)
 * 4. Distribution Contract (contracts/distribution)
 * 5. Audit Contract (contracts/audit)
 */

export interface ContractAddresses {
  fundPool: string;
  distribution: string;
  registry: string;
  milestoneEngine: string;
  audit: string;
  usdcToken: string;
}

export const PROTOCOL_CONTRACTS: ContractAddresses = {
  fundPool: "CA7Q...4V9K (FundPool v0.1)",
  distribution: "CB3M...9L2X (Distribution v0.1)",
  registry: "CD8R...7W4Q (BeneficiaryRegistry v0.1)",
  milestoneEngine: "CE1P...5N8Y (MilestoneEngine v0.1)",
  audit: "CF6K...2M1T (AuditLedger v0.1)",
  usdcToken: "CC4W...6H3Z (USDC on Stellar)",
};

export interface DonorRecord {
  id: string;
  donor: string;
  donorName: string;
  amount: number; // in USDC
  timestamp: string;
  txHash: string;
  ledger: number;
}

export interface Beneficiary {
  id: string;
  address: string;
  name: string;
  region: string;
  category: 'Food Security' | 'Clean Water' | 'Emergency Medical' | 'Shelter Aid' | 'Education';
  isVerified: boolean;
  isActive: boolean;
  registeredAt: string;
  allocatedAmount: number;
  releasedAmount: number;
  milestoneId?: number;
}

export interface Milestone {
  id: number;
  beneficiaryId: string;
  beneficiaryName: string;
  title: string;
  conditionType: 'ManualApproval' | 'TimeUnlock' | 'DeliveryVerification';
  targetLedger: number;
  isMet: boolean;
  createdAt: string;
  metAt?: string;
  approvedBy?: string;
}

export interface Allocation {
  id: string;
  beneficiaryAddress: string;
  beneficiaryName: string;
  amount: number;
  status: 'Pending' | 'Released' | 'Cancelled';
  allocatedAt: string;
  releasedAt?: string;
  milestoneId: number;
  txHash: string;
}

export interface AuditLog {
  eventId: number;
  eventType: 'Donation' | 'BeneficiaryRegistered' | 'BeneficiaryVerified' | 'MilestoneCreated' | 'MilestoneApproved' | 'Allocation' | 'Release';
  actor: string;
  actorRole: 'Donor' | 'NGO Admin' | 'Auditor' | 'Protocol Engine';
  subject: string;
  amount?: number;
  ledger: number;
  timestamp: string;
  txHash: string;
  details: string;
}

// Initial realistic dataset matching examples/ngo_distribution.ts (Nourish Africa Initiative)
export const INITIAL_BENEFICIARIES: Beneficiary[] = [
  {
    id: "ben-1",
    address: "GABENEFICIARY1KANOXXXXXX99824HJA891823HNA1",
    name: "Amina Hassan",
    region: "Kano, Nigeria",
    category: "Food Security",
    isVerified: true,
    isActive: true,
    registeredAt: "2026-10-25 09:15 UTC",
    allocatedAmount: 50,
    releasedAmount: 50,
    milestoneId: 101,
  },
  {
    id: "ben-2",
    address: "GABENEFICIARY2KANOXXXXXX11293KKJ9928172KA2",
    name: "Musa Ibrahim",
    region: "Kano, Nigeria",
    category: "Food Security",
    isVerified: true,
    isActive: true,
    registeredAt: "2026-10-25 09:18 UTC",
    allocatedAmount: 50,
    releasedAmount: 50,
    milestoneId: 102,
  },
  {
    id: "ben-3",
    address: "GABENEFICIARY3KATSINAXXX389182HHSA0019283A3",
    name: "Fatima Yusuf",
    region: "Katsina, Nigeria",
    category: "Food Security",
    isVerified: true,
    isActive: true,
    registeredAt: "2026-10-25 09:20 UTC",
    allocatedAmount: 50,
    releasedAmount: 0,
    milestoneId: 103,
  },
  {
    id: "ben-4",
    address: "GABENEFICIARY4KANOXXXXXX772918KKSA8827181A4",
    name: "Abubakar Musa",
    region: "Kano, Nigeria",
    category: "Food Security",
    isVerified: true,
    isActive: true,
    registeredAt: "2026-10-25 09:22 UTC",
    allocatedAmount: 50,
    releasedAmount: 0,
    milestoneId: 104,
  },
  {
    id: "ben-5",
    address: "GABENEFICIARY5KATSINAXXX449182JJSA6628192A5",
    name: "Halima Sani",
    region: "Katsina, Nigeria",
    category: "Food Security",
    isVerified: false,
    isActive: true,
    registeredAt: "2026-10-25 09:25 UTC",
    allocatedAmount: 50,
    releasedAmount: 0,
    milestoneId: 105,
  },
];

export const INITIAL_MILESTONES: Milestone[] = [
  {
    id: 101,
    beneficiaryId: "ben-1",
    beneficiaryName: "Amina Hassan",
    title: "Household biometric verification & local grain vendor enrollment",
    conditionType: "ManualApproval",
    targetLedger: 0,
    isMet: true,
    createdAt: "2026-10-25 09:30 UTC",
    metAt: "2026-10-25 10:05 UTC",
    approvedBy: "GDONOR99ADMING7Y291882HJA91823HNA1",
  },
  {
    id: 102,
    beneficiaryId: "ben-2",
    beneficiaryName: "Musa Ibrahim",
    title: "Household biometric verification & local grain vendor enrollment",
    conditionType: "ManualApproval",
    targetLedger: 0,
    isMet: true,
    createdAt: "2026-10-25 09:30 UTC",
    metAt: "2026-10-25 10:12 UTC",
    approvedBy: "GDONOR99ADMING7Y291882HJA91823HNA1",
  },
  {
    id: 103,
    beneficiaryId: "ben-3",
    beneficiaryName: "Fatima Yusuf",
    title: "Katsina Regional Center verification check",
    conditionType: "ManualApproval",
    targetLedger: 0,
    isMet: false,
    createdAt: "2026-10-25 09:35 UTC",
  },
  {
    id: 104,
    beneficiaryId: "ben-4",
    beneficiaryName: "Abubakar Musa",
    title: "Emergency ration voucher receipt validation",
    conditionType: "ManualApproval",
    targetLedger: 0,
    isMet: false,
    createdAt: "2026-10-25 09:35 UTC",
  },
  {
    id: 105,
    beneficiaryId: "ben-5",
    beneficiaryName: "Halima Sani",
    title: "Identity documentation verification",
    conditionType: "ManualApproval",
    targetLedger: 0,
    isMet: false,
    createdAt: "2026-10-25 09:40 UTC",
  },
];

export const INITIAL_DONATIONS: DonorRecord[] = [
  {
    id: "don-1",
    donor: "GDONOR77VALIANTFOUNDATION881293774619HKA1",
    donorName: "Valiant Humanitarian Fund",
    amount: 1500,
    timestamp: "2026-10-25 08:30 UTC",
    txHash: "a4c8e19bf07281ef590e82c7a524a1b02874f67389100234acb381029471f001",
    ledger: 54109280,
  },
  {
    id: "don-2",
    donor: "GINDIVIDUALDONOR882716254719283746152KKA2",
    donorName: "Anonymous Global Citizen",
    amount: 500,
    timestamp: "2026-10-25 09:00 UTC",
    txHash: "c983ef11293847aaef091823746182930481729384751029384756102938472b",
    ledger: 54109315,
  },
];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    eventId: 1,
    eventType: "Donation",
    actor: "GDONOR77VALIANTFOUNDATION881293774619HKA1",
    actorRole: "Donor",
    subject: "FundPool Contract",
    amount: 1500,
    ledger: 54109280,
    timestamp: "2026-10-25 08:30:12 UTC",
    txHash: "a4c8e19bf07281ef590e82c7a524a1b02874f67389100234acb381029471f001",
    details: "Valiant Humanitarian Fund contributed 1,500 USDC to FundPool",
  },
  {
    eventId: 2,
    eventType: "Donation",
    actor: "GINDIVIDUALDONOR882716254719283746152KKA2",
    actorRole: "Donor",
    subject: "FundPool Contract",
    amount: 500,
    ledger: 54109315,
    timestamp: "2026-10-25 09:00:44 UTC",
    txHash: "c983ef11293847aaef091823746182930481729384751029384756102938472b",
    details: "Anonymous donor contributed 500 USDC to FundPool",
  },
  {
    eventId: 3,
    eventType: "BeneficiaryRegistered",
    actor: "GNGOADMIN88912384719283746182930481729384KNA1",
    actorRole: "NGO Admin",
    subject: "Amina Hassan (Kano)",
    ledger: 54109340,
    timestamp: "2026-10-25 09:15:02 UTC",
    txHash: "7b102938475610293847561029384756102938475610293847561029384756ab",
    details: "Registered into BeneficiaryRegistry with category 'Food Security'",
  },
  {
    eventId: 4,
    eventType: "BeneficiaryVerified",
    actor: "GNGOADMIN88912384719283746182930481729384KNA1",
    actorRole: "NGO Admin",
    subject: "Amina Hassan (Kano)",
    ledger: 54109355,
    timestamp: "2026-10-25 09:17:33 UTC",
    txHash: "8c213948576102938475610293847561029384756102938475610293847561bc",
    details: "On-chain identity KYC marked verified",
  },
  {
    eventId: 5,
    eventType: "MilestoneApproved",
    actor: "GNGOADMIN88912384719283746182930481729384KNA1",
    actorRole: "NGO Admin",
    subject: "Milestone #101 (Amina Hassan)",
    ledger: 54109400,
    timestamp: "2026-10-25 10:05:18 UTC",
    txHash: "9d324059687213049586721304958672130495867213049586721304958672cd",
    details: "Condition met: Household biometric check confirmed",
  },
  {
    eventId: 6,
    eventType: "Release",
    actor: "CB3M...9L2X (Distribution Contract)",
    actorRole: "Protocol Engine",
    subject: "Amina Hassan (GABENEFICIARY1...)",
    amount: 50,
    ledger: 54109405,
    timestamp: "2026-10-25 10:06:01 UTC",
    txHash: "0e435160798324150697832415069783241506978324150697832415069783de",
    details: "Released 50 USDC to beneficiary after milestone check passed",
  },
  {
    eventId: 7,
    eventType: "Release",
    actor: "CB3M...9L2X (Distribution Contract)",
    actorRole: "Protocol Engine",
    subject: "Musa Ibrahim (GABENEFICIARY2...)",
    amount: 50,
    ledger: 54109420,
    timestamp: "2026-10-25 10:13:42 UTC",
    txHash: "1f546271809435261708943526170894352617089435261708943526170894ef",
    details: "Released 50 USDC to beneficiary after milestone check passed",
  },
];

// Helper to generate simulated cryptographic Stellar tx hash
export function generateTxHash(): string {
  const chars = "0123456789abcdef";
  let hash = "";
  for (let i = 0; i < 64; i++) {
    hash += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return hash;
}
