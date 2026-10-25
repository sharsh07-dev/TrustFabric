import { describe, it, expect, beforeEach } from 'vitest';
import { ContractEscrowService } from '../services/contractEscrowService';

describe('TrustFabric Smart-Contract Escrow Enforcement (P0)', () => {
  let escrow: ContractEscrowService;

  beforeEach(() => {
    escrow = new ContractEscrowService();

    // Register active grant CW-2026-014 with authorized ceiling ₹500,000 (50,000,000 minor)
    const regGrant = escrow.registerGrant({
      grantId: 'grant-cw-014',
      grantCodeHash: '0xabc123...cw-014',
      donorAddress: '0xDonorSafeSepolia8821',
      ceilingMinor: 50000000,
      allowedCategoriesMask: '0x0001',
    });
    expect(regGrant.success).toBe(true);
  });

  it('successfully creates tranche, links delivery attestation, and releases funds under valid conditions', () => {
    const trancheRes = escrow.registerClaimTranche({
      trancheId: 'tranche-001',
      grantId: 'grant-cw-014',
      claimId: 'claim-001',
      beneficiaryOrVendor: '0xVendorApexDrilling',
      amountMinor: 8500000, // ₹85,000
      categoryHash: '0xcat...well_drilling',
      evidenceDocSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      expenseNullifier: '0xnullifier_unique_001',
    });
    expect(trancheRes.success).toBe(true);
    expect(trancheRes.data?.state).toBe('CONDITION_PENDING');

    // Attempt release before delivery attestation -> must fail
    const prematureRelease = escrow.executeRelease('tranche-001');
    expect(prematureRelease.success).toBe(false);
    expect(prematureRelease.error).toContain('MissingDeliveryAttestation');

    // Link verified milestone delivery attestation
    const linkRes = escrow.linkDeliveryAttestation('tranche-001', '0xproof_ed25519_signed_well_borehole');
    expect(linkRes.success).toBe(true);
    expect(linkRes.data?.state).toBe('RELEASE_ELIGIBLE');

    // Execute release
    const releaseRes = escrow.executeRelease('tranche-001');
    expect(releaseRes.success).toBe(true);
    expect(releaseRes.data?.state).toBe('RELEASED');
    expect(releaseRes.data?.releasedAt).toBeGreaterThan(0);

    // Verify grant budget state updated
    const grant = escrow.getGrant('grant-cw-014');
    expect(grant?.totalDisbursedMinor).toBe(8500000);
  });

  it('rejects double-release attempts on already disbursed tranche (Replay & Double Disbursement Protection)', () => {
    escrow.registerClaimTranche({
      trancheId: 'tranche-002',
      grantId: 'grant-cw-014',
      claimId: 'claim-002',
      beneficiaryOrVendor: '0xVendorGreenBuild',
      amountMinor: 4250000,
      categoryHash: '0xcat...materials',
      evidenceDocSha256: 'a1b2c3d498fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      expenseNullifier: '0xnullifier_unique_002',
    });
    escrow.linkDeliveryAttestation('tranche-002', '0xproof_delivery_002');
    const firstRelease = escrow.executeRelease('tranche-002');
    expect(firstRelease.success).toBe(true);

    // Second release attempt MUST fail deterministically
    const secondRelease = escrow.executeRelease('tranche-002');
    expect(secondRelease.success).toBe(false);
    expect(secondRelease.error).toContain('DoubleReleasePrevented');
  });

  it('reverts tranche creation if requested allocation exceeds grant budget ceiling', () => {
    const overBudgetRes = escrow.registerClaimTranche({
      trancheId: 'tranche-overbudget',
      grantId: 'grant-cw-014',
      claimId: 'claim-overbudget',
      beneficiaryOrVendor: '0xVendorApex',
      amountMinor: 60000000, // ₹600,000 exceeds ₹500,000 ceiling
      categoryHash: '0xcat',
      evidenceDocSha256: 'a1b2c3...',
      expenseNullifier: '0xnullifier_over',
    });
    expect(overBudgetRes.success).toBe(false);
    expect(overBudgetRes.error).toContain('OverAllocationLimit');
  });

  it('enforces automatic non-auditor hold when expense nullifier collides with an existing claim (PS42-R09 & PS42-R17)', () => {
    const sharedNullifier = '0xnullifier_cross_donor_conflict_999';

    // 1. First claim legitimately registers the nullifier
    const firstClaim = escrow.registerClaimTranche({
      trancheId: 'tranche-legit-1',
      grantId: 'grant-cw-014',
      claimId: 'claim-original-first',
      beneficiaryOrVendor: '0xVendorA',
      amountMinor: 5000000,
      categoryHash: '0xcat',
      evidenceDocSha256: 'doc-hash-original',
      expenseNullifier: sharedNullifier,
    });
    expect(firstClaim.success).toBe(true);
    expect(firstClaim.data?.state).toBe('CONDITION_PENDING');

    // Verify nullifier is recorded
    const isCommitted = escrow.isNullifierCommitted(sharedNullifier);
    expect(isCommitted.committed).toBe(true);
    expect(isCommitted.claimId).toBe('claim-original-first');

    // 2. Second claim across another tranche attempts to re-use identical nullifier
    const collidingTranche = escrow.registerClaimTranche({
      trancheId: 'tranche-adversary-duplicate',
      grantId: 'grant-cw-014',
      claimId: 'claim-adversary-duplicate',
      beneficiaryOrVendor: '0xVendorB',
      amountMinor: 5000000,
      categoryHash: '0xcat',
      evidenceDocSha256: 'doc-hash-adversary',
      expenseNullifier: sharedNullifier,
    });

    // Contract must place colliding tranche ON_HOLD automatically
    expect(collidingTranche.success).toBe(true);
    expect(collidingTranche.data?.state).toBe('ON_HOLD');
    expect(collidingTranche.eventsEmitted.some(e => e.name === 'AutomatedHoldTriggered')).toBe(true);

    // 3. Attempting to release the held tranche MUST be rejected by contract even with delivery proof
    escrow.linkDeliveryAttestation('tranche-adversary-duplicate', '0xproof_delivery_fake');
    const releaseAttempt = escrow.executeRelease('tranche-adversary-duplicate');
    expect(releaseAttempt.success).toBe(false);
    expect(releaseAttempt.error).toContain('InvalidTrancheState(current: ON_HOLD');

    // 4. Dispute resolution requires documented resolution proof
    const disputeRes = escrow.resolveDispute('tranche-adversary-duplicate', '0xresolution_court_order_cleared');
    expect(disputeRes.success).toBe(true);
    expect(disputeRes.data?.state).toBe('RELEASE_ELIGIBLE');

    // Now release is permitted
    const validReleaseAfterDispute = escrow.executeRelease('tranche-adversary-duplicate');
    expect(validReleaseAfterDispute.success).toBe(true);
    expect(validReleaseAfterDispute.data?.state).toBe('RELEASED');
  });
});
