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
      this.connectionError = 'Database password not yet supplied in DATABASE_URL template.';
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
}
