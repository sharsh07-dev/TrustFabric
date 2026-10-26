import crypto from 'crypto';
import { PaymentDatabase } from '../db.js';
import type {
  ActiveGrant,
  NgoApplicationRecord,
  DonationIntent,
  PaymentAuditEvent,
  UserRole,
} from '../types.js';

export interface DbUserRecord {
  id: string;
  clerkUserId?: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DbExpenseClaimRecord {
  id: string;
  claimCode: string;
  grantId: string;
  submitterId: string;
  amountPaise: number;
  currency: string;
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceSha256: string;
  nullifierHash: string;
  status: 'PENDING' | 'VERIFIED' | 'FLAGGED_DUPLICATE' | 'REJECTED';
  reviewNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DbNullifierRecord {
  id: string;
  nullifierHash: string;
  claimId: string;
  detectedAt: string;
  algorithm: string;
  saltVersion: string;
}

export interface DbAuditBlockRecord {
  id: string;
  sequenceNumber: number;
  actorRef: string;
  action: string;
  previousState?: string;
  newState: string;
  payloadHash: string;
  prevEventHash: string;
  eventHash: string;
  createdAt: string;
}

export interface DbEthDonationRecord {
  id: string;
  txHash: string;
  blockNumber: number;
  campaignId: string;
  donorAddress: string;
  recipientAddress: string;
  amountWei: string;
  amountEth: number;
  status: string;
  chainId: number;
  contractAddress: string;
  confirmedAt: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Cloud Database Persistence Service (PostgreSQL / Supabase + Prisma)
 * Connects to managed cloud Postgres database when credentials are configured.
 * Safely falls back to local memory store with zero downtime when running tests or in offline mode.
 */
export class DbPersistenceService {
  private static instance: DbPersistenceService;
  private prismaClient: any = null;
  private isConnectedToPostgres: boolean = false;
  private connectionError: string | null = null;
  private memDb: PaymentDatabase;

  // In-memory tables for persistence when database connection is pending user credentials
  private usersTable: Map<string, DbUserRecord> = new Map();
  private expenseClaimsTable: Map<string, DbExpenseClaimRecord> = new Map();
  private nullifierRegistry: Map<string, DbNullifierRecord> = new Map();
  private ethDonationsTable: Map<string, DbEthDonationRecord> = new Map();

  private constructor() {
    this.memDb = PaymentDatabase.getInstance();
    this.seedDefaultUsers();
  }

  public static getInstance(): DbPersistenceService {
    if (!DbPersistenceService.instance) {
      DbPersistenceService.instance = new DbPersistenceService();
    }
    return DbPersistenceService.instance;
  }

  /**
   * Initialize Prisma Client connection to PostgreSQL / Supabase
   */
  public async initializePrisma(PrismaClientClass?: any): Promise<{
    connected: boolean;
    provider: 'postgresql' | 'in_memory_fallback';
    error?: string;
  }> {
    const dbUrl = process.env.DATABASE_URL || '';
    
    // Check if user has provided real credentials or still has template placeholder
    if (!dbUrl || dbUrl.includes('[YOUR-PASSWORD]')) {
      this.isConnectedToPostgres = false;
      this.connectionError = 'Database credentials not configured in DATABASE_URL.';
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'FATAL_DATABASE_ERROR: Silent in-memory fallback is strictly forbidden in production mode. A persistent PostgreSQL connection is required.'
        );
      }
      return {
        connected: false,
        provider: 'in_memory_fallback',
        error: this.connectionError,
      };
    }

    try {
      if (PrismaClientClass && !this.prismaClient) {
        this.prismaClient = new PrismaClientClass();
        await this.prismaClient.$connect();
        this.isConnectedToPostgres = true;
        this.connectionError = null;
        return {
          connected: true,
          provider: 'postgresql',
        };
      }
    } catch (err: any) {
      this.isConnectedToPostgres = false;
      this.connectionError = err.message || 'Failed to connect to PostgreSQL pooler';
      return {
        connected: false,
        provider: 'in_memory_fallback',
        error: this.connectionError,
      };
    }

    return {
      connected: this.isConnectedToPostgres,
      provider: this.isConnectedToPostgres ? 'postgresql' : 'in_memory_fallback',
    };
  }

  public getStatus(): {
    connectedToCloud: boolean;
    provider: string;
    databaseUrlMasked: string;
    usersCount: number;
    grantsCount: number;
    claimsCount: number;
    auditBlocksCount: number;
    error: string | null;
  } {
    const rawUrl = process.env.DATABASE_URL || '';
    const maskedUrl = rawUrl.replace(/:([^:@]+)@/, ':****@');

    return {
      connectedToCloud: this.isConnectedToPostgres,
      provider: this.isConnectedToPostgres ? 'Supabase PostgreSQL (aws-0-ap-northeast-1)' : 'In-Memory State Store (Zero Downtime Fallback)',
      databaseUrlMasked: maskedUrl,
      usersCount: this.usersTable.size,
      grantsCount: this.memDb.activeGrants.size,
      claimsCount: this.expenseClaimsTable.size,
      auditBlocksCount: this.memDb.auditEvents.length,
      error: this.connectionError,
    };
  }

  // -------------------------------------------------------------
  // Users Table
  // -------------------------------------------------------------
  private seedDefaultUsers(): void {
    const defaults: DbUserRecord[] = [
      {
        id: 'usr-aarav-donor-001',
        email: 'aarav.sharma@example.org',
        name: 'Aarav Sharma',
        role: 'DONOR',
        organizationId: 'org-individual-donors',
        createdAt: '2026-10-20T00:00:00.000Z',
        updatedAt: '2026-10-20T00:00:00.000Z',
      },
      {
        id: 'usr-meera-admin-002',
        email: 'meera.patel@trustfabric.org',
        name: 'Meera Patel',
        role: 'ADMIN',
        organizationId: 'org-trustfabric-core',
        createdAt: '2026-10-20T00:00:00.000Z',
        updatedAt: '2026-10-20T00:00:00.000Z',
      },
      {
        id: 'usr-anil-auditor-003',
        email: 'anil.verma@audit-trustfabric.gov.in',
        name: 'Anil Verma',
        role: 'AUDITOR',
        organizationId: 'org-independent-auditors',
        createdAt: '2026-10-20T00:00:00.000Z',
        updatedAt: '2026-10-20T00:00:00.000Z',
      },
      {
        id: 'usr-ravi-vendor-004',
        email: 'ravi.kumar@solarpumps-infra.com',
        name: 'Ravi Kumar',
        role: 'VENDOR',
        organizationId: 'org-apex-solar-supplies',
        createdAt: '2026-10-20T00:00:00.000Z',
        updatedAt: '2026-10-20T00:00:00.000Z',
      },
      {
        id: 'usr-priya-field-005',
        email: 'priya.singh@field-water.org',
        name: 'Priya Singh',
        role: 'FIELD_WORKER',
        organizationId: 'org-jaljeevan-relief',
        createdAt: '2026-10-20T00:00:00.000Z',
        updatedAt: '2026-10-20T00:00:00.000Z',
      },
    ];

    for (const u of defaults) {
      this.usersTable.set(u.id, u);
    }
  }

  public async getUser(id: string): Promise<DbUserRecord | undefined> {
    if (this.isConnectedToPostgres && this.prismaClient) {
      return (await this.prismaClient.user.findUnique({ where: { id } })) || undefined;
    }
    return this.usersTable.get(id);
  }

  public async getUserByEmail(email: string): Promise<DbUserRecord | undefined> {
    if (this.isConnectedToPostgres && this.prismaClient) {
      return (await this.prismaClient.user.findUnique({ where: { email } })) || undefined;
    }
    for (const u of this.usersTable.values()) {
      if (u.email.toLowerCase() === email.toLowerCase()) return u;
    }
    return undefined;
  }

  public async getUserByClerkId(clerkUserId: string): Promise<DbUserRecord | undefined> {
    if (this.isConnectedToPostgres && this.prismaClient) {
      return (await this.prismaClient.user.findUnique({ where: { clerkUserId } })) || undefined;
    }
    for (const u of this.usersTable.values()) {
      if (u.clerkUserId === clerkUserId) return u;
    }
    return undefined;
  }

  /**
   * Resolves or provisions a local application user from verified Clerk identity.
   * If an existing user matches by email or clerkUserId, links the clerkUserId.
   * New signups are strictly granted the least-privilege default role 'DONOR'.
   */
  public async syncClerkUser(params: {
    clerkUserId: string;
    email: string;
    name?: string;
  }): Promise<DbUserRecord> {
    const { clerkUserId, email, name } = params;
    const now = new Date().toISOString();

    // 1. Check if user already exists by clerkUserId
    const existingByClerk = await this.getUserByClerkId(clerkUserId);
    if (existingByClerk) {
      return existingByClerk;
    }

    // 2. Check if user already exists by email (safe identity mapping)
    const existingByEmail = await this.getUserByEmail(email);
    if (existingByEmail) {
      const updated: DbUserRecord = {
        ...existingByEmail,
        clerkUserId,
        name: name || existingByEmail.name,
        updatedAt: now,
      };

      if (this.isConnectedToPostgres && this.prismaClient) {
        await this.prismaClient.user.update({
          where: { id: existingByEmail.id },
          data: { clerkUserId, updatedAt: new Date() },
        });
      }
      this.usersTable.set(updated.id, updated);
      return updated;
    }

    // 3. New user signup - strictly assign default DONOR role (never ADMIN or NGO-owner)
    const newUser: DbUserRecord = {
      id: `usr-clerk-${crypto.randomBytes(6).toString('hex')}`,
      clerkUserId,
      email: email.toLowerCase(),
      name: name || email.split('@')[0],
      role: 'DONOR',
      organizationId: 'org-individual-donors',
      createdAt: now,
      updatedAt: now,
    };

    if (this.isConnectedToPostgres && this.prismaClient) {
      await this.prismaClient.user.create({
        data: {
          id: newUser.id,
          clerkUserId: newUser.clerkUserId,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
          organizationId: newUser.organizationId,
        },
      });
    }
    this.usersTable.set(newUser.id, newUser);
    return newUser;
  }

  public async getAllUsers(): Promise<DbUserRecord[]> {
    if (this.isConnectedToPostgres && this.prismaClient) {
      return await this.prismaClient.user.findMany();
    }
    return Array.from(this.usersTable.values());
  }

  // -------------------------------------------------------------
  // Grants & Purpose Allocations
  // -------------------------------------------------------------
  public async getAllGrants(): Promise<ActiveGrant[]> {
    if (this.isConnectedToPostgres && this.prismaClient) {
      const records = await this.prismaClient.grant.findMany();
      return records.map((r: any) => ({
        id: r.id,
        grantCode: r.grantCode,
        title: r.title,
        purpose: r.purpose,
        currency: r.currency,
        minDonationPaise: r.minDonationPaise,
        maxDonationPaise: r.maxDonationPaise,
        status: r.status,
      }));
    }
    return Array.from(this.memDb.activeGrants.values());
  }

  public async getGrant(id: string): Promise<ActiveGrant | undefined> {
    if (this.isConnectedToPostgres && this.prismaClient) {
      const r = await this.prismaClient.grant.findUnique({ where: { id } });
      if (!r) return undefined;
      return {
        id: r.id,
        grantCode: r.grantCode,
        title: r.title,
        purpose: r.purpose,
        currency: r.currency,
        minDonationPaise: r.minDonationPaise,
        maxDonationPaise: r.maxDonationPaise,
        status: r.status,
      };
    }
    return this.memDb.activeGrants.get(id);
  }

  // -------------------------------------------------------------
  // Expense Claims & Duplicate Nullifier Registry
  // -------------------------------------------------------------
  public async submitExpenseClaim(claim: Omit<DbExpenseClaimRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<{
    success: boolean;
    claim?: DbExpenseClaimRecord;
    isDuplicate: boolean;
    duplicateCollidingId?: string;
  }> {
    const id = `claim-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    // Check duplicate nullifier collision
    const existingCollision = this.nullifierRegistry.get(claim.nullifierHash);
    if (existingCollision) {
      const flaggedRecord: DbExpenseClaimRecord = {
        ...claim,
        id,
        status: 'FLAGGED_DUPLICATE',
        reviewNotes: `Duplicate nullifier collision with prior claim: ${existingCollision.claimId}`,
        createdAt: now,
        updatedAt: now,
      };
      this.expenseClaimsTable.set(id, flaggedRecord);

      return {
        success: false,
        claim: flaggedRecord,
        isDuplicate: true,
        duplicateCollidingId: existingCollision.claimId,
      };
    }

    const savedRecord: DbExpenseClaimRecord = {
      ...claim,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.expenseClaimsTable.set(id, savedRecord);

    const nullifierEntry: DbNullifierRecord = {
      id: `nullifier-${Date.now()}`,
      nullifierHash: claim.nullifierHash,
      claimId: id,
      detectedAt: now,
      algorithm: 'HMAC_SHA256_NULLIFIER_V1',
      saltVersion: process.env.NULLIFIER_SALT || 'TF_EXPENSE_SALT_2026_CASCADE_PS42',
    };
    this.nullifierRegistry.set(claim.nullifierHash, nullifierEntry);

    return {
      success: true,
      claim: savedRecord,
      isDuplicate: false,
    };
  }

  public async getAllExpenseClaims(): Promise<DbExpenseClaimRecord[]> {
    return Array.from(this.expenseClaimsTable.values());
  }

  public async getNullifierRegistry(): Promise<DbNullifierRecord[]> {
    return Array.from(this.nullifierRegistry.values());
  }

  // -------------------------------------------------------------
  // Sequential Cryptographic Audit Ledger (SHA-256 Block Chain)
  // -------------------------------------------------------------
  public async appendAuditBlock(entry: {
    actorRef: string;
    action: string;
    previousState?: string;
    newState: string;
    payload: any;
  }): Promise<DbAuditBlockRecord> {
    const auditRecord = this.memDb.appendAudit({
      actorRef: entry.actorRef,
      action: entry.action,
      previousState: entry.previousState,
      newState: entry.newState,
      payload: entry.payload,
    });

    return {
      id: auditRecord.id,
      sequenceNumber: auditRecord.sequenceNumber,
      actorRef: auditRecord.actorRef,
      action: auditRecord.action,
      previousState: auditRecord.previousState,
      newState: auditRecord.newState,
      payloadHash: auditRecord.payloadHash,
      prevEventHash: auditRecord.prevEventHash,
      eventHash: auditRecord.eventHash,
      createdAt: auditRecord.createdAt,
    };
  }

  public async getAuditBlocks(): Promise<PaymentAuditEvent[]> {
    return this.memDb.auditEvents;
  }

  // -------------------------------------------------------------
  // On-Chain MetaMask Sepolia ETH Donations
  // -------------------------------------------------------------
  public async recordEthDonation(params: Omit<DbEthDonationRecord, 'id' | 'createdAt' | 'updatedAt' | 'confirmedAt'> & { confirmedAt?: string }): Promise<DbEthDonationRecord> {
    const existing = await this.getEthDonationByTxHash(params.txHash);
    if (existing) {
      return existing; // Idempotent: return existing recorded donation
    }

    const now = new Date().toISOString();
    const record: DbEthDonationRecord = {
      id: `eth-don-${crypto.randomBytes(6).toString('hex')}`,
      ...params,
      confirmedAt: params.confirmedAt || now,
      createdAt: now,
      updatedAt: now,
    };

    if (this.isConnectedToPostgres && this.prismaClient) {
      try {
        await this.prismaClient.ethDonation.create({
          data: {
            id: record.id,
            txHash: record.txHash,
            blockNumber: record.blockNumber,
            campaignId: record.campaignId,
            donorAddress: record.donorAddress,
            recipientAddress: record.recipientAddress,
            amountWei: record.amountWei,
            amountEth: record.amountEth,
            status: record.status,
            chainId: record.chainId,
            contractAddress: record.contractAddress,
            confirmedAt: new Date(record.confirmedAt),
          },
        });
      } catch (err: any) {
        console.warn('[DbPersistenceService] Failed to persist ethDonation in Postgres, saved in memory fallback:', err.message);
      }
    }

    this.ethDonationsTable.set(record.txHash.toLowerCase(), record);
    return record;
  }

  public async getEthDonationByTxHash(txHash: string): Promise<DbEthDonationRecord | undefined> {
    if (this.isConnectedToPostgres && this.prismaClient) {
      try {
        const rec = await this.prismaClient.ethDonation.findUnique({ where: { txHash } });
        if (rec) {
          return {
            ...rec,
            confirmedAt: rec.confirmedAt.toISOString(),
            createdAt: rec.createdAt.toISOString(),
            updatedAt: rec.updatedAt.toISOString(),
          };
        }
      } catch {
        // Fallback to in-memory
      }
    }
    return this.ethDonationsTable.get(txHash.toLowerCase());
  }

  public async getAllEthDonations(): Promise<DbEthDonationRecord[]> {
    if (this.isConnectedToPostgres && this.prismaClient) {
      try {
        const records = await this.prismaClient.ethDonation.findMany({ orderBy: { confirmedAt: 'desc' } });
        return records.map((r: any) => ({
          ...r,
          confirmedAt: r.confirmedAt.toISOString(),
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        }));
      } catch {
        // Fallback to in-memory
      }
    }
    return Array.from(this.ethDonationsTable.values()).sort(
      (a, b) => new Date(b.confirmedAt).getTime() - new Date(a.confirmedAt).getTime()
    );
  }
}
