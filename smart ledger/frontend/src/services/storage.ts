/**
 * TrustFabric Client-Side & Local Storage Persistence Layer
 * Provides atomic persistence for Grants, Allocations, Claims, Documents, Audit Logs, and Findings.
 * Persists state across page reloads and re-logins.
 */

import {
  type Grant,
  type Allocation,
  type FinancialEvent,
  type FlowEdge,
  type ExpenseClaim,
  type EvidenceDocument,
  type DeliveryAttestation,
  type VerificationFinding,
  type EscrowCase,
  type AuditEvent,
  type Report,
  type BankStatementLine,
  type UserRole,
} from '../types/trustfabric';
import { createInitialSeedData } from './seedData';
import { AuditLedgerService } from './auditLedger';
import { DuplicateEngine } from './duplicateEngine';
import { EscrowStateMachine } from './escrowStateMachine';
import { DiscrepancyEngine } from './discrepancyEngine';

const STORAGE_KEY_PREFIX = 'trustfabric_state_v1';

export interface TrustFabricStoreState {
  grants: Grant[];
  allocations: Allocation[];
  events: FinancialEvent[];
  flowEdges: FlowEdge[];
  claims: ExpenseClaim[];
  documents: EvidenceDocument[];
  deliveryAttestations: DeliveryAttestation[];
  escrowCases: EscrowCase[];
  findings: VerificationFinding[];
  auditEvents: AuditEvent[];
  reports: Report[];
  bankStatements: BankStatementLine[];
  currentUserRole: UserRole;
  activeDonorId: string;
}

export class TrustFabricStorage {
  private static instance: TrustFabricStorage;
  private state: TrustFabricStoreState | null = null;
  public auditLedger: AuditLedgerService;
  public duplicateEngine: DuplicateEngine;
  public escrowMachine: EscrowStateMachine;

  private constructor() {
    this.auditLedger = new AuditLedgerService();
    this.duplicateEngine = new DuplicateEngine();
    this.escrowMachine = new EscrowStateMachine();
  }

  public static getInstance(): TrustFabricStorage {
    if (!TrustFabricStorage.instance) {
      TrustFabricStorage.instance = new TrustFabricStorage();
    }
    return TrustFabricStorage.instance;
  }

  public async initialize(): Promise<TrustFabricStoreState> {
    if (this.state) return this.state;

    try {
      const serialized = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_PREFIX) : null;
      if (serialized) {
        const parsed = JSON.parse(serialized) as TrustFabricStoreState;
        this.state = parsed;
        this.auditLedger = new AuditLedgerService(parsed.auditEvents);
        this.escrowMachine = new EscrowStateMachine(parsed.escrowCases);
        for (const doc of parsed.documents) {
          this.duplicateEngine.indexDocument(doc);
        }
        return this.state;
      }
    } catch (e) {
      console.warn('LocalStorage read failed, initializing clean seed state:', e);
    }

    // Seed Initial Data
    return await this.resetToDemoSeed();
  }

  public getState(): TrustFabricStoreState {
    if (!this.state) {
      throw new Error('Storage has not been initialized. Call initialize() first.');
    }
    return this.state;
  }

  public saveState(updated: Partial<TrustFabricStoreState>): void {
    if (!this.state) return;
    this.state = { ...this.state, ...updated };

    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_PREFIX, JSON.stringify(this.state));
      }
    } catch (e) {
      console.error('Failed to persist state to localStorage:', e);
    }
  }

  public async resetToDemoSeed(): Promise<TrustFabricStoreState> {
    const seed = await createInitialSeedData();
    this.auditLedger = new AuditLedgerService();
    this.escrowMachine = new EscrowStateMachine(seed.escrowCases);
    this.duplicateEngine = new DuplicateEngine();

    for (const doc of seed.documents) {
      this.duplicateEngine.indexDocument(doc);
    }

    // Log genesis audit event
    await this.auditLedger.appendEvent({
      actorRef: 'SYSTEM_BOOTSTRAP',
      actorRole: 'ADMIN',
      action: 'SYSTEM_INITIALIZATION',
      entityType: 'PLATFORM',
      entityId: 'TRUSTFABRIC_GENESIS',
      reason: 'Seeded initial CASCADE PS 4.2 demonstration scenario (Grant CW-2026-014).',
    });

    const initialFindings = DiscrepancyEngine.evaluateAll({
      grants: seed.grants,
      allocations: seed.allocations,
      events: seed.events,
      flowEdges: seed.flowEdges,
      claims: seed.claims,
      documents: seed.documents,
      deliveryAttestations: seed.deliveryAttestations,
      reports: seed.reports,
    });

    this.state = {
      grants: seed.grants,
      allocations: seed.allocations,
      events: seed.events,
      flowEdges: seed.flowEdges,
      claims: seed.claims,
      documents: seed.documents,
      deliveryAttestations: seed.deliveryAttestations,
      escrowCases: seed.escrowCases,
      findings: initialFindings,
      auditEvents: this.auditLedger.getEvents(),
      reports: seed.reports,
      bankStatements: seed.bankStatements,
      currentUserRole: 'ADMIN',
      activeDonorId: 'donor-northstar',
    };

    this.saveState(this.state);
    return this.state;
  }
}
