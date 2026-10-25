/**
 * TrustFabric Grant & Purpose-Bound Allocation Policy Engine
 * Enforces grant bounds, allowed category scoping, milestone conditions, and balance math.
 * Satisfies PS42-R03, AT-ALLOC-01 to AT-ALLOC-04.
 */

import { type Grant, type Allocation, type ExpenseClaim, type EscrowCase } from '../types/trustfabric';

export class GrantPolicyService {
  /**
   * Validates and adds an allocation to a grant
   */
  public static validateAndAddAllocation(
    grant: Grant,
    existingAllocations: Allocation[],
    newAllocation: {
      category: string;
      amountMinor: number;
      currency: string;
      milestoneId: string;
    }
  ): { success: boolean; allocation?: Allocation; error?: string } {
    // 1. Currency must match grant currency
    if (newAllocation.currency.toUpperCase() !== grant.currency.toUpperCase()) {
      return {
        success: false,
        error: `Currency mismatch: Allocation currency (${newAllocation.currency}) does not match Grant currency (${grant.currency}).`,
      };
    }

    // 2. Category check (PS42-R03 / AT-ALLOC-03)
    if (!grant.allowedCategories.includes(newAllocation.category)) {
      return {
        success: false,
        error: `CATEGORY VIOLATION: "${newAllocation.category}" is not an authorized spending category for Grant ${grant.grantCode}. Authorized: [${grant.allowedCategories.join(', ')}].`,
      };
    }

    // 3. Over-allocation check (PS42-R03 / AT-ALLOC-02)
    const currentAllocated = existingAllocations
      .filter(a => a.grantId === grant.id && a.status !== 'CANCELLED')
      .reduce((sum, a) => sum + a.amountMinor, 0);

    const projectedAllocated = currentAllocated + newAllocation.amountMinor;

    if (projectedAllocated > grant.authorizedAmountMinor) {
      const overage = projectedAllocated - grant.authorizedAmountMinor;
      return {
        success: false,
        error: `BUDGET EXCEEDED: Allocation of ${(newAllocation.amountMinor / 100).toLocaleString()} ${grant.currency} exceeds remaining unallocated budget by ${(overage / 100).toLocaleString()} ${grant.currency}. Authorized cap is ${(grant.authorizedAmountMinor / 100).toLocaleString()} ${grant.currency}.`,
      };
    }

    // 4. Milestone link check
    const milestone = grant.milestones.find(m => m.id === newAllocation.milestoneId);
    if (!milestone) {
      return {
        success: false,
        error: `Milestone reference "${newAllocation.milestoneId}" does not exist in Grant ${grant.grantCode}.`,
      };
    }

    const allocation: Allocation = {
      id: `alloc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      grantId: grant.id,
      category: newAllocation.category,
      amountMinor: newAllocation.amountMinor,
      currency: newAllocation.currency,
      milestoneId: newAllocation.milestoneId,
      conditionHash: `COND_HASH_MILESTONE_${newAllocation.milestoneId}_${newAllocation.category}`,
      status: 'APPROVED',
      createdAt: new Date().toISOString(),
    };

    return { success: true, allocation };
  }

  /**
   * Recalculates authoritative grant financial totals
   */
  public static calculateGrantFinancials(
    grant: Grant,
    allocations: Allocation[],
    claims: ExpenseClaim[],
    escrowCases: EscrowCase[]
  ): {
    allocatedMinor: number;
    spentMinor: number;
    heldMinor: number;
    unreconciledMinor: number;
    remainingMinor: number;
  } {
    const grantAllocations = allocations.filter(a => a.grantId === grant.id && a.status !== 'CANCELLED');
    const grantClaims = claims.filter(c => c.grantId === grant.id);

    const allocatedMinor = grantAllocations.reduce((acc, curr) => acc + curr.amountMinor, 0);

    let spentMinor = 0;
    let heldMinor = 0;
    let unreconciledMinor = 0;

    for (const claim of grantClaims) {
      const esc = escrowCases.find(e => e.claimId === claim.id);
      if (esc?.state === 'RELEASED') {
        spentMinor += claim.amountMinor;
      } else if (esc?.state === 'ON_HOLD') {
        heldMinor += claim.amountMinor;
      } else {
        unreconciledMinor += claim.amountMinor;
      }
    }

    const remainingMinor = Math.max(0, grant.authorizedAmountMinor - spentMinor);

    return {
      allocatedMinor,
      spentMinor,
      heldMinor,
      unreconciledMinor,
      remainingMinor,
    };
  }
}
