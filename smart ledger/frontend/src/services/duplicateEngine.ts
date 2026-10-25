/**
 * TrustFabric Duplicate Evidence & Cross-Donor Nullifier Registry
 * Implements exact byte matching, normalized invoice tuple matching,
 * and atomic privacy-preserving expense nullifiers.
 * Satisfies PS42-R14, PS42-R16, AT-DUP-01 to AT-DUP-07.
 */

import {
  type EvidenceDocument,
  type ExpenseClaim,
  type DuplicateMatch,
  type VerificationFinding,
} from '../types/trustfabric';
import { computeExpenseNullifier } from './crypto';

export interface NullifierRegistryEntry {
  nullifier: string;
  claimId: string;
  grantId: string;
  registeredAt: string;
}

export class DuplicateEngine {
  private nullifierRegistry: Map<string, NullifierRegistryEntry> = new Map();
  private documentsBySha256: Map<string, EvidenceDocument[]> = new Map();

  constructor(initialEntries?: NullifierRegistryEntry[]) {
    if (initialEntries) {
      for (const entry of initialEntries) {
        this.nullifierRegistry.set(entry.nullifier, entry);
      }
    }
  }

  public getNullifierEntries(): NullifierRegistryEntry[] {
    return Array.from(this.nullifierRegistry.values());
  }

  /**
   * Registers a document's SHA-256 for exact byte-level tracking
   */
  public indexDocument(doc: EvidenceDocument): void {
    const list = this.documentsBySha256.get(doc.sha256) || [];
    list.push(doc);
    this.documentsBySha256.set(doc.sha256, list);
  }

  /**
   * Checks whether an evidence document is an exact byte duplicate
   */
  public checkByteDuplicate(doc: EvidenceDocument): DuplicateMatch | null {
    const existing = this.documentsBySha256.get(doc.sha256) || [];
    const match = existing.find(d => d.id !== doc.id && d.claimId !== doc.claimId);

    if (match) {
      return {
        id: `dup-byte-${Date.now()}`,
        claimId: doc.claimId,
        matchedClaimId: match.claimId,
        matchType: 'EXACT_BYTE_DIGEST',
        scoreOrRule: 'RULE-DUP-01: Exact SHA-256 Byte Hash Collision',
        evidenceRefs: [doc.id, match.id],
        status: 'ACTIVE_DISPUTE',
        detectedAt: new Date().toISOString(),
      };
    }
    return null;
  }

  /**
   * Checks for normalized invoice claim duplicates across all recorded claims
   */
  public checkNormalizedClaimDuplicate(
    newClaim: ExpenseClaim,
    allClaims: ExpenseClaim[]
  ): DuplicateMatch | null {
    const match = allClaims.find(c => {
      if (c.id === newClaim.id) return false;

      // Normalization comparison
      const sameVendor = c.vendorRef.trim().toUpperCase() === newClaim.vendorRef.trim().toUpperCase();
      const sameToken = c.invoiceNumberToken.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') ===
        newClaim.invoiceNumberToken.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const sameAmount = c.amountMinor === newClaim.amountMinor;
      const sameCurrency = c.currency.toUpperCase() === newClaim.currency.toUpperCase();
      const sameDate = c.invoiceDate.split('T')[0] === newClaim.invoiceDate.split('T')[0];

      // Exact normalized invoice match across claims
      return sameVendor && sameToken && sameAmount && sameCurrency && sameDate;
    });

    if (match) {
      return {
        id: `dup-norm-${Date.now()}`,
        claimId: newClaim.id,
        matchedClaimId: match.id,
        matchType: 'NORMALIZED_CLAIM_TUPLE',
        scoreOrRule: 'RULE-DUP-02: Normalized Claim Tuple Match (Vendor + Token + Amount + Date)',
        evidenceRefs: [newClaim.id, match.id],
        status: 'ACTIVE_DISPUTE',
        detectedAt: new Date().toISOString(),
      };
    }

    return null;
  }

  /**
   * Atomic Registration of Expense Nullifier (PS42-R16 & PS42-R17)
   * If the nullifier already exists for another claim or grant:
   * ATOMICALLY rejects registration, marks duplicate conflict, and returns an enforceable finding.
   */
  public async registerExpenseNullifier(
    claim: ExpenseClaim,
    fields: {
      vendorName: string;
      invoiceNumber: string;
      totalAmountMinor: number;
      currency: string;
      date: string;
    }
  ): Promise<{
    success: boolean;
    nullifier: string;
    duplicateMatch?: DuplicateMatch;
    finding?: VerificationFinding;
  }> {
    const nullifier = await computeExpenseNullifier(fields);

    // Atomic existence check
    const existing = this.nullifierRegistry.get(nullifier);

    if (existing && existing.claimId !== claim.id) {
      // CONFLICT! Nullifier reused across reports
      const duplicateMatch: DuplicateMatch = {
        id: `dup-nul-${Date.now()}`,
        claimId: claim.id,
        matchedClaimId: existing.claimId,
        matchType: 'EXPENSE_NULLIFIER_COLLISION',
        scoreOrRule: 'RULE-DUP-03: Shared Cross-Report Expense Nullifier Collision',
        evidenceRefs: [claim.id, existing.claimId],
        status: 'ACTIVE_DISPUTE',
        detectedAt: new Date().toISOString(),
      };

      const finding: VerificationFinding = {
        id: `find-dup-${Date.now()}`,
        grantId: claim.grantId,
        claimId: claim.id,
        type: 'DUPLICATE_CLAIM_DETECTED',
        severity: 'CRITICAL',
        ruleId: 'RULE-DUP-03',
        title: 'Cross-Donor Expense Re-use Detected via Nullifier Registry',
        explanation: `This expense nullifier (${nullifier.substring(0, 16)}...) was previously registered under Grant ${existing.grantId} (Claim ${existing.claimId}). Automated policy prevents double-crediting expenditure across donors.`,
        evidenceRefs: [claim.id, existing.claimId],
        affectedAmountMinor: claim.amountMinor,
        findingStatus: 'OPEN',
        actionTaken: 'AUTOMATIC_ESCROW_FREEZE_TRIGGERED',
        detectedAt: new Date().toISOString(),
      };

      return {
        success: false,
        nullifier,
        duplicateMatch,
        finding,
      };
    }

    // Register atomically
    this.nullifierRegistry.set(nullifier, {
      nullifier,
      claimId: claim.id,
      grantId: claim.grantId,
      registeredAt: new Date().toISOString(),
    });

    return {
      success: true,
      nullifier,
    };
  }
}
