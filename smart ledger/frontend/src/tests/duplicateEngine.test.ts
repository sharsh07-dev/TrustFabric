import { describe, it, expect } from 'vitest';
import { DuplicateEngine } from '../services/duplicateEngine';
import { type EvidenceDocument, type ExpenseClaim } from '../types/trustfabric';

describe('Duplicate Engine & Nullifier Registry (PS42-R14, PS42-R16, PS42-R17)', () => {
  it('AT-DUP-01: Detects exact byte-level SHA-256 duplicate document across claims', () => {
    const engine = new DuplicateEngine();

    const doc1: EvidenceDocument = {
      id: 'doc-1',
      claimId: 'claim-1',
      filename: 'Invoice_INV1047.pdf',
      storageKey: 'vault://doc1.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      canonicalCommitment: 'COMMITMENT_1',
      expenseNullifierRef: 'NULLIFIER_1',
      extractedFields: {
        vendorName: 'GreenBuild',
        invoiceNumber: 'INV-1047',
        date: '2026-02-15',
        totalAmountMinor: 4250000,
        currency: 'INR',
        isOcrExtracted: true,
      },
      verificationStatus: 'SOURCE_ATTESTED',
      uploadedBy: 'user1',
      uploadedAt: '2026-02-15T00:00:00Z',
    };

    engine.indexDocument(doc1);

    // Second document uploaded under a different claim with exact same sha256
    const doc2: EvidenceDocument = {
      ...doc1,
      id: 'doc-2',
      claimId: 'claim-2', // Different claim
      filename: 'Scanned_Receipt_Copy.pdf',
    };

    const duplicateMatch = engine.checkByteDuplicate(doc2);
    expect(duplicateMatch).not.toBeNull();
    expect(duplicateMatch?.matchType).toBe('EXACT_BYTE_DIGEST');
    expect(duplicateMatch?.matchedClaimId).toBe('claim-1');
  });

  it('AT-DUP-02: Detects normalized claim tuple match (Vendor + Token + Amount + Date)', () => {
    const engine = new DuplicateEngine();

    const claim1: ExpenseClaim = {
      id: 'claim-1',
      grantId: 'grant-cw-014',
      vendorRef: 'GreenBuild Supplies Ltd',
      invoiceNumberToken: 'INV-1047',
      currency: 'INR',
      amountMinor: 4250000,
      invoiceDate: '2026-02-15T09:00:00Z',
      category: 'Water Infrastructure',
      purposeRef: 'Piping',
      claimStatus: 'VERIFIED',
      disbursementStatus: 'RELEASED',
      createdAt: '2026-02-15T00:00:00Z',
      updatedAt: '2026-02-15T00:00:00Z',
    };

    // Second claim in another grant with slight formatting differences
    const claim2: ExpenseClaim = {
      id: 'claim-2',
      grantId: 'grant-cw-015', // Different donor grant!
      vendorRef: 'greenbuild supplies ltd ',
      invoiceNumberToken: 'inv-1047',
      currency: 'inr',
      amountMinor: 4250000,
      invoiceDate: '2026-02-15T18:00:00Z',
      category: 'Sanitation',
      purposeRef: 'Different purpose description',
      claimStatus: 'SUBMITTED',
      disbursementStatus: 'CONDITION_PENDING',
      createdAt: '2026-02-20T00:00:00Z',
      updatedAt: '2026-02-20T00:00:00Z',
    };

    const duplicateMatch = engine.checkNormalizedClaimDuplicate(claim2, [claim1]);
    expect(duplicateMatch).not.toBeNull();
    expect(duplicateMatch?.matchType).toBe('NORMALIZED_CLAIM_TUPLE');
    expect(duplicateMatch?.matchedClaimId).toBe('claim-1');
  });

  it('PS42-R16 & PS42-R17: Atomic nullifier registry triggers automatic conflict and hold finding', async () => {
    const engine = new DuplicateEngine();

    const claimA: ExpenseClaim = {
      id: 'claim-A',
      grantId: 'grant-donor-A',
      vendorRef: 'GreenBuild Supplies',
      invoiceNumberToken: 'INV-1047',
      currency: 'INR',
      amountMinor: 4250000,
      invoiceDate: '2026-02-15',
      category: 'Water',
      purposeRef: 'Water',
      claimStatus: 'VERIFIED',
      disbursementStatus: 'RELEASED',
      createdAt: '2026-02-15T00:00:00Z',
      updatedAt: '2026-02-15T00:00:00Z',
    };

    const claimB: ExpenseClaim = {
      ...claimA,
      id: 'claim-B',
      grantId: 'grant-donor-B', // Second donor report
    };

    const invoiceFields = {
      vendorName: 'GreenBuild Supplies',
      invoiceNumber: 'INV-1047',
      totalAmountMinor: 4250000,
      currency: 'INR',
      date: '2026-02-15',
    };

    // First registration succeeds
    const resA = await engine.registerExpenseNullifier(claimA, invoiceFields);
    expect(resA.success).toBe(true);
    expect(resA.nullifier).toBeDefined();

    // Second registration for different claim ATOMICALLY FAILS and produces critical finding
    const resB = await engine.registerExpenseNullifier(claimB, invoiceFields);
    expect(resB.success).toBe(false);
    expect(resB.duplicateMatch?.matchType).toBe('EXPENSE_NULLIFIER_COLLISION');
    expect(resB.finding?.severity).toBe('CRITICAL');
    expect(resB.finding?.actionTaken).toBe('AUTOMATIC_ESCROW_FREEZE_TRIGGERED');
  });
});
