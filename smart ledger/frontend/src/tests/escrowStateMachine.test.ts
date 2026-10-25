import { describe, it, expect } from 'vitest';
import { EscrowStateMachine } from '../services/escrowStateMachine';
import { type ExpenseClaim, type Grant } from '../types/trustfabric';

describe('Escrow State Machine & Automated Freezing (PS42-R04, PS42-R17)', () => {
  const sampleGrant: Grant = {
    id: 'grant-cw-014',
    grantCode: 'CW-2026-014',
    donorId: 'donor-northstar',
    organizationId: 'org-1',
    purpose: 'Clean Water',
    currency: 'INR',
    authorizedAmountMinor: 100000000,
    allowedCategories: ['Water Infrastructure'],
    milestones: [],
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    allocatedMinor: 0,
    spentMinor: 0,
    unreconciledMinor: 0,
    heldMinor: 0,
    remainingMinor: 100000000,
  };

  const sampleClaim: ExpenseClaim = {
    id: 'claim-101',
    grantId: sampleGrant.id,
    vendorRef: 'GreenBuild',
    invoiceNumberToken: 'INV-1047',
    currency: 'INR',
    amountMinor: 4250000,
    invoiceDate: '2026-02-15',
    category: 'Water Infrastructure',
    purposeRef: 'Piping',
    claimStatus: 'SUBMITTED',
    disbursementStatus: 'CONDITION_PENDING',
    createdAt: '2026-02-15T00:00:00Z',
    updatedAt: '2026-02-15T00:00:00Z',
  };

  it('PS42-R17: Deterministically transitions to ON_HOLD without centralized human auditor', () => {
    const machine = new EscrowStateMachine();
    machine.initializeTranche(sampleClaim);

    // Automated trigger from nullifier collision
    const escrowCase = machine.triggerAutomaticHold(
      sampleClaim.id,
      'Duplicate nullifier detected on public cross-report registry',
      'find-dup-101',
      'APP_HOLD'
    );

    expect(escrowCase.state).toBe('ON_HOLD');
    expect(escrowCase.transitionReason).toContain('AUTOMATED POLICY FREEZE');
  });

  it('AT-ESCROW-02: Rejects release execution while tranche is in ON_HOLD state', () => {
    const machine = new EscrowStateMachine();
    machine.initializeTranche(sampleClaim);
    machine.triggerAutomaticHold(sampleClaim.id, 'Duplicate detected', 'find-101');

    const releaseResult = machine.attemptRelease(
      sampleClaim.id,
      sampleGrant,
      sampleClaim,
      'ADMIN',
      { eligible: true, reason: 'Conditions met' }
    );

    expect(releaseResult.success).toBe(false);
    expect(releaseResult.state).toBe('ON_HOLD');
    expect(releaseResult.message).toContain('RELEASE REJECTED: Tranche is ON_HOLD');
  });

  it('AT-ESCROW-03: Claimant cannot unilaterally clear their own escrow hold', () => {
    const machine = new EscrowStateMachine();
    machine.initializeTranche(sampleClaim);
    machine.triggerAutomaticHold(sampleClaim.id, 'Duplicate detected', 'find-101');

    // Attempting resolution with claimant role (e.g. FINANCE_OFFICER / DONOR)
    const resolveResult = machine.resolveDispute(
      sampleClaim.id,
      'FINANCE_OFFICER',
      'Claimant wants to lift hold'
    );

    expect(resolveResult.success).toBe(false);
    expect(resolveResult.message).toContain('PERMISSION DENIED: Claimants cannot unilaterally resolve');
  });

  it('AT-ESCROW-04: Authorized Independent Auditor can formally resolve and lift hold', () => {
    const machine = new EscrowStateMachine();
    machine.initializeTranche(sampleClaim);
    machine.triggerAutomaticHold(sampleClaim.id, 'Duplicate detected', 'find-101');

    const resolveResult = machine.resolveDispute(
      sampleClaim.id,
      'AUDITOR',
      'Independent audit verified separate deliveries with manufacturer proof.'
    );

    expect(resolveResult.success).toBe(true);
    const updatedCase = machine.getCaseForClaim(sampleClaim.id);
    expect(updatedCase?.state).toBe('CONDITION_PENDING');
  });
});
