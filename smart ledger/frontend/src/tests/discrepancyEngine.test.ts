import { describe, it, expect } from 'vitest';
import { DiscrepancyEngine } from '../services/discrepancyEngine';
import { createInitialSeedData } from '../services/seedData';

describe('Discrepancy Engine (PS42-R08, PS42-R09, PS42-R10, PS42-R20)', () => {
  it('Detects unexplained transfers, category breaches, and report mismatches in seed data', async () => {
    const seed = await createInitialSeedData();

    const findings = DiscrepancyEngine.evaluateAll({
      grants: seed.grants,
      allocations: seed.allocations,
      events: seed.events,
      flowEdges: seed.flowEdges,
      claims: seed.claims,
      documents: seed.documents,
      deliveryAttestations: seed.deliveryAttestations,
      reports: seed.reports,
    });

    expect(findings.length).toBeGreaterThan(0);

    // Check Rule 1: Unexplained Transfer (PS42-R08)
    const rule1 = findings.find(f => f.ruleId === 'RULE-DISC-01');
    expect(rule1).toBeDefined();
    expect(rule1?.severity).toBe('CRITICAL');
    expect(rule1?.type).toBe('UNEXPLAINED_TRANSFER');

    // Check Rule 2: Out of Category Spending (PS42-R09)
    const rule2 = findings.find(f => f.ruleId === 'RULE-DISC-02');
    expect(rule2).toBeDefined();
    expect(rule2?.type).toBe('OUT_OF_CATEGORY_SPEND');
    expect(rule2?.explanation).toContain('Executive Travel');

    // Check Rule 6: Report Total Discrepancy (PS42-R10)
    const rule6 = findings.find(f => f.ruleId === 'RULE-DISC-06');
    expect(rule6).toBeDefined();
    expect(rule6?.type).toBe('REPORT_TOTAL_MISMATCH');
    expect(rule6?.affectedAmountMinor).toBe(60750000); // Exact gap of ₹6,07,500

    // Check Rule 7: Unreconciled Multi-Hop Gap (PS42-R12 / PS42-R20)
    const rule7 = findings.find(f => f.ruleId === 'RULE-DISC-07');
    expect(rule7).toBeDefined();
    expect(rule7?.title).toContain('Unreconciled Multi-Hop Link');
  });
});
