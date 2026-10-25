/**
 * TrustFabric Escrow State Machine & Automated Hold Engine
 * Implements deterministic condition checks and automatic non-auditor freezing.
 * Satisfies PS42-R04, PS42-R17, AT-ESCROW-01 to AT-ESCROW-04.
 */

import {
  type EscrowState,
  type EscrowCase,
  type ExpenseClaim,
  type Grant,
  type UserRole,
} from '../types/trustfabric';

export class EscrowStateMachine {
  private cases: Map<string, EscrowCase> = new Map();

  constructor(initialCases?: EscrowCase[]) {
    if (initialCases) {
      for (const c of initialCases) {
        this.cases.set(c.claimId, c);
      }
    }
  }

  public getCases(): EscrowCase[] {
    return Array.from(this.cases.values());
  }

  public getCaseForClaim(claimId: string): EscrowCase | undefined {
    return this.cases.get(claimId);
  }

  /**
   * Initializes escrow tranche for an expense claim
   */
  public initializeTranche(claim: ExpenseClaim): EscrowCase {
    const existing = this.cases.get(claim.id);
    if (existing) return existing;

    const escrowCase: EscrowCase = {
      id: `esc-${claim.id}`,
      grantId: claim.grantId,
      claimId: claim.id,
      trancheId: `tranche-${claim.id.substring(0, 8)}`,
      state: 'CONDITION_PENDING',
      enforcementType: 'APP_HOLD', // Labeled as pilot application state until live contract test passes
      lastTransition: new Date().toISOString(),
      transitionReason: 'Tranche initialized pending verification of invoice commitments and delivery attestations.',
    };

    this.cases.set(claim.id, escrowCase);
    return escrowCase;
  }

  /**
   * PS42-R17: Freeze Escrow Without Centralized Auditor
   * Deterministically transitions tranche to ON_HOLD upon proven duplicate nullifier or critical finding.
   * No human clicks or administrative manual intervention required.
   */
  public triggerAutomaticHold(
    claimId: string,
    reason: string,
    triggerFindingId: string,
    enforcementType: 'CONTRACT_HOLD' | 'APP_HOLD' = 'APP_HOLD'
  ): EscrowCase {
    let escrowCase = this.cases.get(claimId);
    if (!escrowCase) {
      escrowCase = {
        id: `esc-${claimId}`,
        grantId: 'UNKNOWN_GRANT',
        claimId,
        trancheId: `tranche-${claimId.substring(0, 8)}`,
        state: 'ON_HOLD',
        triggerFindingId,
        enforcementType,
        lastTransition: new Date().toISOString(),
        transitionReason: `AUTOMATED POLICY FREEZE: ${reason}`,
      };
    } else {
      escrowCase.state = 'ON_HOLD';
      escrowCase.triggerFindingId = triggerFindingId;
      escrowCase.enforcementType = enforcementType;
      escrowCase.lastTransition = new Date().toISOString();
      escrowCase.transitionReason = `AUTOMATED POLICY FREEZE: ${reason}`;
    }

    this.cases.set(claimId, escrowCase);
    return escrowCase;
  }

  /**
   * Evaluates if a claim is eligible for release
   */
  public evaluateEligibility(
    claim: ExpenseClaim,
    grant: Grant,
    hasValidEvidence: boolean,
    hasValidDeliveryAttestation: boolean,
    hasOpenCriticalFindings: boolean
  ): { eligible: boolean; state: EscrowState; reason: string } {
    const escrowCase = this.cases.get(claim.id);

    // 1. If currently held, cannot be eligible
    if (escrowCase && escrowCase.state === 'ON_HOLD') {
      return {
        eligible: false,
        state: 'ON_HOLD',
        reason: `Tranche is frozen under ON_HOLD: ${escrowCase.transitionReason}`,
      };
    }

    // 2. Critical discrepancy findings block release
    if (hasOpenCriticalFindings) {
      return {
        eligible: false,
        state: 'ON_HOLD',
        reason: 'Blocked by open critical discrepancy findings.',
      };
    }

    // 3. Category authorization check
    if (!grant.allowedCategories.includes(claim.category)) {
      return {
        eligible: false,
        state: 'CONDITION_PENDING',
        reason: `Expense category "${claim.category}" is outside the authorized grant scope.`,
      };
    }

    // 4. Evidence requirement
    if (!hasValidEvidence) {
      return {
        eligible: false,
        state: 'CONDITION_PENDING',
        reason: 'Invoice evidence commitment is missing or unverified.',
      };
    }

    // 5. Delivery attestation requirement
    if (!hasValidDeliveryAttestation) {
      return {
        eligible: false,
        state: 'CONDITION_PENDING',
        reason: 'Milestone proof of delivery is pending valid cryptographic signature.',
      };
    }

    return {
      eligible: true,
      state: 'RELEASE_ELIGIBLE',
      reason: 'All smart-contract policy conditions verified: category valid, evidence matched, delivery signed.',
    };
  }

  /**
   * AT-ESCROW-02: Attempt Release
   * Must reject release if held or conditions are unmet.
   */
  public attemptRelease(
    claimId: string,
    _grant: Grant,
    _claim: ExpenseClaim,
    callerRole: UserRole,
    eligibilityCheck: { eligible: boolean; reason: string }
  ): { success: boolean; state: EscrowState; message: string } {
    const escrowCase = this.cases.get(claimId);

    if (escrowCase && escrowCase.state === 'ON_HOLD') {
      return {
        success: false,
        state: 'ON_HOLD',
        message: `RELEASE REJECTED: Tranche is ON_HOLD due to conflict (${escrowCase.transitionReason}). Release denied by protocol rule.`,
      };
    }

    if (!eligibilityCheck.eligible) {
      return {
        success: false,
        state: escrowCase?.state || 'CONDITION_PENDING',
        message: `RELEASE REJECTED: Conditions not met. Reason: ${eligibilityCheck.reason}`,
      };
    }

    // State transition to RELEASED
    if (escrowCase) {
      escrowCase.state = 'RELEASED';
      escrowCase.lastTransition = new Date().toISOString();
      escrowCase.transitionReason = `Disbursement released by ${callerRole} following verified conditions.`;
    }

    return {
      success: true,
      state: 'RELEASED',
      message: 'Disbursement successfully authorized and executed to beneficiary payment channel.',
    };
  }

  /**
   * AT-ESCROW-03: Multi-Party Dispute Resolution
   * Claimant CANNOT clear its own hold; requires independent Auditor or Governance role with rationale.
   */
  public resolveDispute(
    claimId: string,
    callerRole: UserRole,
    resolutionReason: string
  ): { success: boolean; message: string } {
    if (callerRole !== 'AUDITOR' && callerRole !== 'ADMIN') {
      return {
        success: false,
        message: 'PERMISSION DENIED: Claimants cannot unilaterally resolve or clear their own escrow holds.',
      };
    }

    const escrowCase = this.cases.get(claimId);
    if (!escrowCase) {
      return { success: false, message: 'Escrow case not found.' };
    }

    if (escrowCase.state !== 'ON_HOLD') {
      return { success: false, message: 'Claim is not in an ON_HOLD state.' };
    }

    escrowCase.state = 'CONDITION_PENDING';
    escrowCase.lastTransition = new Date().toISOString();
    escrowCase.transitionReason = `DISPUTE RESOLVED by ${callerRole}: ${resolutionReason}`;

    return {
      success: true,
      message: `Hold successfully lifted by ${callerRole}. Tranche returned to condition evaluation.`,
    };
  }
}
