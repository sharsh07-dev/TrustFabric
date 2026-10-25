import { describe, it, expect } from 'vitest';
import { GrantPolicyService } from '../services/grantPolicy';
import { type Grant, type Allocation } from '../types/trustfabric';

describe('Grant Policy Engine (PS42-R03 / AT-ALLOC-01 to AT-ALLOC-04)', () => {
  const sampleGrant: Grant = {
    id: 'grant-test-01',
    grantCode: 'CW-2026-014',
    donorId: 'donor-northstar',
    organizationId: 'org-test',
    purpose: 'Clean Water Project',
    currency: 'INR',
    authorizedAmountMinor: 100000000, // ₹10,00,000.00
    allowedCategories: ['Water Infrastructure', 'Sanitation Equipment'],
    milestones: [
      {
        id: 'MS-01',
        title: 'Borehole Drilling',
        description: 'Drilling',
        targetDate: '2026-03-01',
        amountMinor: 40000000,
        conditionType: 'DELIVERY_ATTESTATION',
        isMet: false,
      },
    ],
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    allocatedMinor: 0,
    spentMinor: 0,
    unreconciledMinor: 0,
    heldMinor: 0,
    remainingMinor: 100000000,
  };

  it('AT-ALLOC-01: Successfully creates an allocation within purpose scope and budget', () => {
    const existing: Allocation[] = [];
    const result = GrantPolicyService.validateAndAddAllocation(sampleGrant, existing, {
      category: 'Water Infrastructure',
      amountMinor: 35000000, // ₹3,50,000
      currency: 'INR',
      milestoneId: 'MS-01',
    });

    expect(result.success).toBe(true);
    expect(result.allocation).toBeDefined();
    expect(result.allocation?.amountMinor).toBe(35000000);
    expect(result.allocation?.category).toBe('Water Infrastructure');
  });

  it('AT-ALLOC-02: Rejects over-allocation exceeding grant authorized amount', () => {
    const existing: Allocation[] = [
      {
        id: 'alloc-1',
        grantId: sampleGrant.id,
        category: 'Water Infrastructure',
        amountMinor: 80000000, // ₹8,00,000
        currency: 'INR',
        milestoneId: 'MS-01',
        conditionHash: 'HASH',
        status: 'APPROVED',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];

    // Attempting to add ₹3,00,000 when only ₹2,00,000 remaining
    const result = GrantPolicyService.validateAndAddAllocation(sampleGrant, existing, {
      category: 'Water Infrastructure',
      amountMinor: 30000000,
      currency: 'INR',
      milestoneId: 'MS-01',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('BUDGET EXCEEDED');
  });

  it('AT-ALLOC-03: Rejects allocation for unauthorized category', () => {
    const existing: Allocation[] = [];
    // Category 'Executive Travel' is not in allowedCategories
    const result = GrantPolicyService.validateAndAddAllocation(sampleGrant, existing, {
      category: 'Executive Travel',
      amountMinor: 10000000,
      currency: 'INR',
      milestoneId: 'MS-01',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('CATEGORY VIOLATION');
  });
});
